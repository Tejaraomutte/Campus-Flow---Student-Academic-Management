import math
import os
import uuid
from datetime import date, datetime, timezone
from functools import wraps

import jwt
from dotenv import load_dotenv
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

from database import connect_mongo, connect_cassandra, seed_data

load_dotenv()
app = Flask(__name__)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5174",
            ]
        }
    },
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
app.config["JWT_SECRET"] = os.getenv("JWT_SECRET", "local-demo-secret-change-me")
app.config["JWT_EXPIRY_HOURS"] = int(os.getenv("JWT_EXPIRY_HOURS", "8"))

mongo = connect_mongo()
cassandra = connect_cassandra()
seed_data(mongo, cassandra)

def json_error(message, status=400):
    return jsonify({"error": message}), status


def serialize_student(doc):
    if not doc:
        return None
    return {
        "student_id": doc.get("student_id"),
        "roll_no": doc.get("roll_no"),
        "name": doc.get("name"),
        "email": doc.get("email"),
        "department": doc.get("department"),
        "semester": doc.get("semester"),
        "phone": doc.get("phone", ""),
        "status": doc.get("status", "Active"),
    }


def issue_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["user_id"],
        "email": user["email"],
        "role": user["role"],
        "student_id": user.get("student_id"),
        "name": user["name"],
        "iat": now,
        "exp": now.timestamp() + app.config["JWT_EXPIRY_HOURS"] * 3600,
    }
    return jwt.encode(payload, app.config["JWT_SECRET"], algorithm="HS256")


def auth_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return json_error("Authentication required.", 401)
            try:
                token = header.split(" ", 1)[1]
                g.user = jwt.decode(token, app.config["JWT_SECRET"], algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return json_error("Session expired. Please sign in again.", 401)
            except jwt.InvalidTokenError:
                return json_error("Invalid session token.", 401)
            if roles and g.user.get("role") not in roles:
                return json_error("You do not have permission to perform this action.", 403)
            return fn(*args, **kwargs)
        return wrapped
    return decorator


def can_access_student(student_id):
    return g.user.get("role") != "Student" or g.user.get("student_id") == student_id


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "student-academic-api"})


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if not email or not password:
        return json_error("Enter your email and password.")
    user = mongo.users.find_one({"email": email})
    if not user or not check_password_hash(user.get("password_hash", ""), password):
        return json_error("Incorrect email or password.", 401)
    return jsonify({
        "token": issue_token(user),
        "user": {
            "user_id": user["user_id"], "email": user["email"],
            "name": user["name"], "role": user["role"],
            "student_id": user.get("student_id"),
        }
    })


@app.get("/api/auth/me")
@auth_required()
def me():
    return jsonify({"user": {
        "user_id": g.user["sub"], "email": g.user["email"],
        "name": g.user["name"], "role": g.user["role"],
        "student_id": g.user.get("student_id"),
    }})


@app.get("/api/students")
@auth_required()
def list_students():
    query = {}
    if g.user.get("role") == "Student":
        query["student_id"] = g.user.get("student_id")
    search = request.args.get("search", "").strip()
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"roll_no": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}},
        ]
    docs = mongo.students.find(query).sort("roll_no", 1).limit(500)
    return jsonify({"students": [serialize_student(d) for d in docs]})



@app.post("/api/students")
@auth_required("Admin")
def create_student():
    body = request.get_json(silent=True) or {}

    required = [
        "roll_no", "name", "email",
        "department", "semester", "password"
    ]

    missing = [
        field for field in required
        if body.get(field) is None
        or str(body.get(field)).strip() == ""
    ]
    if missing:
        return json_error(
            "Required fields: " + ", ".join(missing)
        )

    roll_no = str(body["roll_no"]).strip().upper()
    name = str(body["name"]).strip()
    email = str(body["email"]).strip().lower()
    password = str(body["password"])

    if len(password) < 8:
        return json_error(
            "Password must contain at least 8 characters."
        )

    if mongo.students.find_one({
        "$or": [
            {"roll_no": roll_no},
            {"email": email}
        ]
    }):
        return json_error(
            "A student with this roll number or email already exists.",
            409
        )

    if mongo.users.find_one({"email": email}):
        return json_error(
            "A login account with this email already exists.",
            409
        )

    try:
        semester = int(body["semester"])
        if not 1 <= semester <= 12:
            return json_error(
                "Semester must be between 1 and 12."
            )
    except (TypeError, ValueError):
        return json_error("Semester must be a number.")

    student = {
        "student_id": "STU-" + uuid.uuid4().hex[:10].upper(),
        "roll_no": roll_no,
        "name": name,
        "email": email,
        "department": str(body["department"]).strip(),
        "semester": semester,
        "phone": str(body.get("phone", "")).strip(),
        "status": str(body.get("status", "Active")).strip(),
        "created_at": datetime.now(timezone.utc),
    }

    user_account = {
        "user_id": str(uuid.uuid4()),
        "email": email,
        "name": name,
        "role": "Student",
        "student_id": student["student_id"],
        "password_hash": generate_password_hash(password),
        "created_at": datetime.now(timezone.utc),
    }

    student_inserted = False

    try:
        mongo.students.insert_one(student)
        student_inserted = True

        mongo.users.insert_one(user_account)

    except Exception:
        if student_inserted:
            mongo.students.delete_one({
                "student_id": student["student_id"]
            })

        app.logger.exception(
            "Failed to create student profile and login account."
        )
        return json_error(
            "Could not create the student account. "
            "Check the backend terminal for details.",
            500
        )

    return jsonify({
        "message": "Student profile and login account created successfully.",
        "student": serialize_student(student)
    }), 201


@app.put("/api/students/<student_id>")
@auth_required("Admin", "Faculty")
def update_student(student_id):
    body = request.get_json(silent=True) or {}
    allowed = ["roll_no", "name", "email", "department", "semester", "phone", "status"]
    update = {k: body[k] for k in allowed if k in body}
    if not update:
        return json_error("No editable fields were supplied.")
    if "semester" in update:
        try:
            update["semester"] = int(update["semester"])
            if not 1 <= update["semester"] <= 12:
                return json_error("Semester must be between 1 and 12.")
        except (TypeError, ValueError):
            return json_error("Semester must be a number.")
    for field in ("roll_no", "name", "department", "status"):
        if field in update:
            update[field] = str(update[field]).strip()
    if "roll_no" in update:
        update["roll_no"] = update["roll_no"].upper()
    if "email" in update:
        update["email"] = str(update["email"]).strip().lower()
    result = mongo.students.update_one({"student_id": student_id}, {"$set": update})
    if result.matched_count == 0:
        return json_error("Student not found.", 404)
    return jsonify({"student": serialize_student(mongo.students.find_one({"student_id": student_id}) )})


@app.delete("/api/students/<student_id>")
@auth_required("Admin")
def delete_student(student_id):
    result = mongo.students.delete_one({"student_id": student_id})
    if result.deleted_count == 0:
        return json_error("Student not found.", 404)
    return jsonify({"message": "Student deleted."})


def get_attendance(student_id, month):
    rows = cassandra.execute(
        """SELECT student_id, month, attendance_date, subject, status, marked_by
           FROM attendance_by_student_month WHERE student_id=%s AND month=%s""",
        (student_id, month),
    )
    output = []
    for row in rows:
        output.append({
            "student_id": row["student_id"], "month": row["month"],
            "date": str(row["attendance_date"]),
            "subject": row["subject"], "status": row["status"],
            "marked_by": row.get("marked_by") or "",
        })
    return output


@app.get("/api/attendance")
@auth_required()
def list_attendance():
    student_id = request.args.get("student_id", "").strip()
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    if g.user.get("role") == "Student":
        student_id = g.user.get("student_id")
    if not student_id:
        return json_error("Select a student.")
    if not can_access_student(student_id):
        return json_error("You cannot view another student's attendance.", 403)
    if len(month) != 7 or month[4] != "-":
        return json_error("Month must use YYYY-MM format.")
    return jsonify({"attendance": get_attendance(student_id, month), "month": month})


@app.post("/api/attendance")
@auth_required("Admin", "Faculty")
def mark_attendance():
    body = request.get_json(silent=True) or {}
    student_id = str(body.get("student_id", "")).strip()
    attendance_date = str(body.get("date", "")).strip()
    subject = str(body.get("subject", "")).strip()
    status = str(body.get("status", "")).strip().title()
    if not all([student_id, attendance_date, subject]) or status not in ("Present", "Absent", "Late", "Excused"):
        return json_error("Provide student, date, subject, and a valid attendance status.")
    if not mongo.students.find_one({"student_id": student_id}):
        return json_error("Student not found.", 404)
    try:
        day = date.fromisoformat(attendance_date)
    except ValueError:
        return json_error("Date must use YYYY-MM-DD.")
    month = day.strftime("%Y-%m")
    cassandra.execute("""
        INSERT INTO attendance_by_student_month
        (student_id, month, attendance_date, subject, status, marked_by, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (student_id, month, day, subject, status, g.user.get("email", ""), datetime.now(timezone.utc)))
    return jsonify({"message": "Attendance saved."}), 201


def get_marks(student_id, semester):
    rows = list(cassandra.execute(
        """SELECT student_id, semester, subject, assessment, gpa, updated_at
           FROM gpa_by_student_semester WHERE student_id=%s AND semester=%s""",
        (student_id, semester),
    ))
    stored_results = {(row["subject"], row["assessment"]) for row in rows}
    legacy_rows = cassandra.execute(
        """SELECT student_id, semester, subject, assessment, max_marks, marks_obtained, updated_at
           FROM marks_by_student_semester WHERE student_id=%s AND semester=%s""",
        (student_id, semester),
    )
    migrated_results = False
    for row in legacy_rows:
        result_key = (row["subject"], row["assessment"])
        if result_key not in stored_results:
            max_marks = row.get("max_marks") or 0
            gpa = round(row["marks_obtained"] / max_marks * 10, 2) if max_marks else 0.0
            cassandra.execute(
                """INSERT INTO gpa_by_student_semester
                   (student_id, semester, subject, assessment, gpa, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s) IF NOT EXISTS""",
                (student_id, semester, row["subject"], row["assessment"], gpa, row.get("updated_at")),
            )
            stored_results.add(result_key)
            migrated_results = True
    if migrated_results:
        rows = cassandra.execute(
            """SELECT student_id, semester, subject, assessment, gpa, updated_at
               FROM gpa_by_student_semester WHERE student_id=%s AND semester=%s""",
            (student_id, semester),
        )
    output = []
    for row in rows:
        output.append({
            "student_id": row["student_id"], "semester": row["semester"],
            "subject": row["subject"], "assessment": row["assessment"],
            "gpa": row["gpa"],
        })
    return output


@app.get("/api/marks")
@auth_required()
def list_marks():
    student_id = request.args.get("student_id", "").strip()
    try:
        semester = int(request.args.get("semester", "1"))
    except ValueError:
        return json_error("Semester must be a number.")
    if g.user.get("role") == "Student":
        student_id = g.user.get("student_id")
    if not student_id:
        return json_error("Select a student.")
    if not can_access_student(student_id):
        return json_error("You cannot view another student's marks.", 403)
    if not mongo.students.find_one({"student_id": student_id}):
        return json_error("Student not found.", 404)
    marks = get_marks(student_id, semester)
    return jsonify({"marks": marks, "semester": semester})


@app.post("/api/marks")
@auth_required("Admin", "Faculty")
def save_marks():
    body = request.get_json(silent=True) or {}
    try:
        semester = int(body.get("semester"))
        gpa = float(body.get("gpa"))
    except (TypeError, ValueError):
        return json_error("Semester must be a number and GPA must be between 0 and 10.")
    if not math.isfinite(gpa) or not 0 <= gpa <= 10:
        return json_error("GPA must be between 0 and 10.")
    student_id = str(body.get("student_id", "")).strip()
    subject = str(body.get("subject", "")).strip()
    assessment = str(body.get("assessment", "Internal 1")).strip()
    if not student_id or not subject or not assessment:
        return json_error("Select a student and provide subject and assessment.")
    if not 1 <= semester <= 12:
        return json_error("Semester must be between 1 and 12.")
    if not mongo.students.find_one({"student_id": student_id}):
        return json_error("Student not found.", 404)
    cassandra.execute("""
        INSERT INTO gpa_by_student_semester
        (student_id, semester, subject, assessment, gpa, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (student_id, semester, subject, assessment, round(gpa, 2), datetime.now(timezone.utc)))
    return jsonify({"message": "GPA saved."}), 201


@app.get("/api/dashboard")
@auth_required()
def dashboard():
    if g.user.get("role") == "Student":
        students = list(mongo.students.find({"student_id": g.user.get("student_id")}))
    else:
        students = list(mongo.students.find({}).limit(500))
    total_students = len(students)
    today = date.today()
    month = today.strftime("%Y-%m")
    attendance_total = 0
    attendance_present = 0
    gpa_values = []
    attendance_recent = []
    for student in students:
        sid = student["student_id"]
        for row in get_attendance(sid, month):
            attendance_total += 1
            if row["status"] in ("Present", "Late", "Excused"):
                attendance_present += 1
            attendance_recent.append({
                "name": student.get("name", ""),
                "roll_no": student.get("roll_no", ""),
                "date": row["date"], "subject": row["subject"], "status": row["status"],
            })
        for sem in range(1, 13):
            for mark in get_marks(sid, sem):
                gpa_values.append(mark["gpa"])
    attendance_rate = round(attendance_present / attendance_total * 100, 1) if attendance_total else 0
    recent_students = [serialize_student(s) for s in students[:5]]
    return jsonify({
        "total_students": total_students,
        "average_gpa": round(sum(gpa_values) / len(gpa_values), 2) if gpa_values else 0,
        "attendance_rate": attendance_rate,
        "assessments_count": len(gpa_values),
        "recent_students": recent_students,
        "recent_attendance": sorted(attendance_recent, key=lambda x: x["date"], reverse=True)[:6],
    })


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Endpoint not found."}), 404


@app.errorhandler(500)
def server_error(_):
    app.logger.exception("Unhandled server error")
    return jsonify({"error": "An unexpected server error occurred. Check the Flask terminal for details."}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "0") == "1")
