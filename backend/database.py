import os
import time
import uuid
from datetime import date, datetime, timezone

from cassandra.cluster import Cluster
from cassandra.query import dict_factory
from pymongo import MongoClient, ASCENDING
from werkzeug.security import generate_password_hash

mongo_client = None
mongo_db = None
cassandra_cluster = None
cassandra_session = None


def connect_mongo():
    global mongo_client, mongo_db
    uri = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017")
    mongo_client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    mongo_client.admin.command("ping")
    mongo_db = mongo_client[os.getenv("MONGO_DB", "student_academic_erp")]
    mongo_db.students.create_index([("roll_no", ASCENDING)], unique=True)
    mongo_db.users.create_index([("email", ASCENDING)], unique=True)
    return mongo_db


def connect_cassandra():
    global cassandra_cluster, cassandra_session
    hosts = [x.strip() for x in os.getenv("CASSANDRA_HOSTS", "127.0.0.1").split(",") if x.strip()]
    port = int(os.getenv("CASSANDRA_PORT", "9042"))
    last_error = None
    for attempt in range(1, 13):
        try:
            cassandra_cluster = Cluster(hosts, port=port, connect_timeout=8)
            session = cassandra_cluster.connect()
            session.execute("""
                CREATE KEYSPACE IF NOT EXISTS student_academic
                WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
            """)
            session.set_keyspace("student_academic")
            session.row_factory = dict_factory
            session.execute("""
                CREATE TABLE IF NOT EXISTS attendance_by_student_month (
                    student_id text,
                    month text,
                    attendance_date date,
                    subject text,
                    status text,
                    marked_by text,
                    created_at timestamp,
                    PRIMARY KEY ((student_id, month), attendance_date, subject)
                )
            """)
            session.execute("""
                CREATE TABLE IF NOT EXISTS marks_by_student_semester (
                    student_id text,
                    semester int,
                    subject text,
                    assessment text,
                    max_marks int,
                    marks_obtained int,
                    updated_at timestamp,
                    PRIMARY KEY ((student_id, semester), subject, assessment)
                )
            """)
            session.execute("""
                CREATE TABLE IF NOT EXISTS gpa_by_student_semester (
                    student_id text,
                    semester int,
                    subject text,
                    assessment text,
                    gpa double,
                    updated_at timestamp,
                    PRIMARY KEY ((student_id, semester), subject, assessment)
                )
            """)
            cassandra_session = session
            return session
        except Exception as exc:
            last_error = exc
            if cassandra_cluster:
                try:
                    cassandra_cluster.shutdown()
                except Exception:
                    pass
                cassandra_cluster = None
            if attempt < 12:
                print(f"Cassandra not ready (attempt {attempt}/12); retrying in 5 seconds...")
                time.sleep(5)
    raise RuntimeError(f"Could not connect to Cassandra: {last_error}")


def seed_data(db, session):
    """Create fictional demo data once, preserving data on later restarts."""
    demo_students = [
        {
            "student_id": "STU-2026-001", "roll_no": "26CSE001",
            "name": "Aarav Sharma", "email": "aarav@college.local",
            "department": "Computer Science", "semester": 3,
            "phone": "9000000001", "status": "Active",
            "created_at": datetime.now(timezone.utc),
        },
        {
            "student_id": "STU-2026-002", "roll_no": "26CSE002",
            "name": "Diya Reddy", "email": "diya@college.local",
            "department": "Computer Science", "semester": 3,
            "phone": "9000000002", "status": "Active",
            "created_at": datetime.now(timezone.utc),
        },
        {
            "student_id": "STU-2026-003", "roll_no": "26ECE003",
            "name": "Ishaan Rao", "email": "ishaan@college.local",
            "department": "Electronics", "semester": 5,
            "phone": "9000000003", "status": "Active",
            "created_at": datetime.now(timezone.utc),
        },
    ]
    for student in demo_students:
        db.students.update_one(
            {"student_id": student["student_id"]},
            {"$setOnInsert": student},
            upsert=True,
        )

    demo_users = [
        ("admin@college.local", "Admin123!", "Admin", None, "College Admin"),
        ("faculty@college.local", "Faculty123!", "Faculty", None, "Faculty Demo"),
        ("student@college.local", "Student123!", "Student", "STU-2026-001", "Aarav Sharma"),
    ]
    for email, password, role, student_id, name in demo_users:
        db.users.update_one(
            {"email": email},
            {"$setOnInsert": {
                "user_id": str(uuid.uuid4()),
                "email": email,
                "password_hash": generate_password_hash(password),
                "role": role,
                "student_id": student_id,
                "name": name,
                "created_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

    # A small amount of sample data makes the dashboard useful on first login.
    today = date.today()
    month = today.strftime("%Y-%m")
    for student_id, subject, status in [
        ("STU-2026-001", "Data Structures", "Present"),
        ("STU-2026-001", "Database Systems", "Present"),
        ("STU-2026-002", "Data Structures", "Absent"),
        ("STU-2026-002", "Database Systems", "Present"),
        ("STU-2026-003", "Digital Logic", "Present"),
    ]:
        session.execute("""
            INSERT INTO attendance_by_student_month
            (student_id, month, attendance_date, subject, status, marked_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s) IF NOT EXISTS
        """, (student_id, month, today, subject, status, "seed", datetime.now(timezone.utc)))

    demo_gpas = [
        ("STU-2026-001", 3, "Data Structures", "Internal 1", 8.67),
        ("STU-2026-001", 3, "Database Systems", "Internal 1", 8.00),
        ("STU-2026-002", 3, "Data Structures", "Internal 1", 6.33),
        ("STU-2026-002", 3, "Database Systems", "Internal 1", 8.33),
        ("STU-2026-003", 5, "Digital Logic", "Internal 1", 9.00),
    ]
    for row in demo_gpas:
        session.execute("""
            INSERT INTO gpa_by_student_semester
            (student_id, semester, subject, assessment, gpa, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s) IF NOT EXISTS
        """, (*row, datetime.now(timezone.utc)))


def close_connections():
    global mongo_client, cassandra_cluster
    if mongo_client:
        mongo_client.close()
    if cassandra_cluster:
        cassandra_cluster.shutdown()
