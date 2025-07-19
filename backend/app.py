import os
import datetime
import jwt
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from authlib.integrations.flask_client import OAuth

# --- App Configuration ---
app = Flask(__name__)
CORS(app)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a-very-secret-key-for-session')

# --- Database Config ---
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL or 'sqlite:///' + os.path.join(basedir, 'database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Upload Folder Config ---
if os.environ.get('RENDER'):
    # On Render, the disk is mounted at this absolute path
    app.config['UPLOAD_FOLDER'] = '/var/data/uploads'
else:
    # For local development, create a folder in the backend directory
    app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'uploads')
    # Create the folder locally if it doesn't exist
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)

# --- OAuth Configuration ---
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.environ.get('GOOGLE_CLIENT_ID'),
    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
    access_token_url='https://accounts.google.com/o/oauth2/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    userinfo_endpoint='https://openidconnect.googleapis.com/v1/userinfo',
    client_kwargs={'scope': 'openid email profile'},
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration'
)

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(256), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='user')
    solutions = db.relationship('Solution', backref='creator', lazy=True, cascade="all, delete-orphan")
    login_history = db.relationship('LoginHistory', backref='user', lazy=True, cascade="all, delete-orphan")
    activity_logs = db.relationship('ActivityLog', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, pw): self.password_hash = generate_password_hash(pw)
    def check_password(self, pw): return check_password_hash(self.password_hash, pw) if self.password_hash else False
    def to_dict(self): return {"id": self.id, "username": self.username, "role": self.role}

class Subject(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(20), nullable=True)
    solutions = db.relationship('Solution', backref='subject', lazy=True, cascade="all, delete-orphan")
    def to_dict(self): return {"id": self.id, "name": self.name, "icon": self.icon}
    
class Solution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)
    file_path = db.Column(db.String(300), nullable=True)
    date_created = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    subject_id = db.Column(db.Integer, db.ForeignKey('subject.id'), nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def to_dict_public(self): 
        return { "id": self.id, "title": self.title, "date": self.date_created.strftime("%d %b %Y"), "creator_username": self.creator.username if self.creator else "N/A" }
    def to_dict_detail(self): return {"id": self.id, "title": self.title, "content": self.content, "file_path": self.file_path, "subject_id": self.subject_id}
    def to_dict_admin(self): 
        return { "id": self.id, "title": self.title, "subjectName": self.subject.name if self.subject else "N/A", "date": self.date_created.strftime("%d %b %Y"), "subject_id": self.subject_id, "content": self.content, "file_path": self.file_path, "creator_username": self.creator.username if self.creator else "N/A" }

class LoginHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    ip_address = db.Column(db.String(45), nullable=False)
    user_agent = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    def to_dict(self): return { "id": self.id, "username": self.user.username if self.user else "N/A", "ip_address": self.ip_address, "user_agent": self.user_agent, "timestamp": self.timestamp.strftime("%Y-%m-%d %H:%M:%S") }

class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    def to_dict(self): return { "id": self.id, "username": self.user.username if self.user else "N/A", "action": self.action, "timestamp": self.timestamp.strftime("%Y-%m-%d %H:%M:%S") }

# --- Logging Helper ---
def log_activity(user, action):
    log = ActivityLog(user_id=user.id, action=action)
    db.session.add(log)

# --- Authorization Decorators ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'authorization' in request.headers: token = request.headers['authorization'].split(" ")[1]
        if not token: return jsonify({'message': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.get(data['id'])
            if not current_user: return jsonify({'message': 'User not found!'}), 401
        except Exception as e: return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401
        return f(current_user, *args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    @token_required
    def decorated(current_user, *args, **kwargs):
        if current_user.role != 'admin': return jsonify({'message': 'Admin role required!'}), 403
        return f(current_user, *args, **kwargs)
    return decorated

def moderator_or_admin_required(f):
    @wraps(f)
    @token_required
    def decorated(current_user, *args, **kwargs):
        if current_user.role not in ['admin', 'moderator']: return jsonify({'message': 'Admin or Moderator role required!'}), 403
        return f(current_user, *args, **kwargs)
    return decorated

# --- Serve Frontend Files ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    frontend_dir = os.path.join(os.path.dirname(app.root_path), 'frontend')
    if path != "" and os.path.exists(os.path.join(frontend_dir, path)):
        return send_from_directory(frontend_dir, path)
    else:
        return send_from_directory(frontend_dir, 'index.html')

# --- Authentication Routes ---
@app.route('/login/google')
def google_login():
    redirect_uri = url_for('google_auth_callback', _external=True)
    return google.authorize_redirect(redirect_uri, hd='rmutsvmail.com')

@app.route('/auth/google/callback')
def google_auth_callback():
    try:
        token = google.authorize_access_token()
        user_info = google.get('userinfo').json()
        
        user_email = user_info.get('email')
        
        if not user_email or not user_email.endswith('@rmutsvmail.com'):
            return redirect(f'/index.html?error=domain_mismatch')

        user = User.query.filter_by(email=user_email).first()
        if not user:
            username = user_email.split('@')[0]
            base_username = username
            counter = 1
            while User.query.filter_by(username=username).first():
                username = f"{base_username}{counter}"
                counter += 1
            
            user = User(username=username, email=user_email, role='user')
            db.session.add(user)
            db.session.commit()
            log_activity(user, "สร้างบัญชีผู้ใช้ผ่าน Google")

        app_token = jwt.encode({
            'id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        login_log = LoginHistory(user_id=user.id, ip_address=request.remote_addr, user_agent=request.headers.get('User-Agent', 'Unknown'))
        db.session.add(login_log)
        db.session.commit()

        return redirect(f'/auth-success.html?token={app_token}&role={user.role}&username={user.username}')

    except Exception as e:
        return redirect(f'/index.html?error=oauth_failed')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'): return jsonify({"message": "Missing credentials"}), 400
    user = User.query.filter_by(username=data.get('username')).first()
    if user and user.check_password(data.get('password')):
        login_log = LoginHistory(user_id=user.id, ip_address=request.remote_addr, user_agent=request.headers.get('User-Agent', 'Unknown'))
        db.session.add(login_log)
        db.session.commit()

        token = jwt.encode({'id': user.id, 'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)}, app.config['SECRET_KEY'], algorithm="HS256")
        return jsonify({"access_token": token, "user": user.to_dict()}), 200
    return jsonify({"message": "Invalid credentials"}), 401

# --- Public API Routes ---
@app.route('/api/subjects', methods=['GET'])
def get_public_subjects(): return jsonify([s.to_dict() for s in Subject.query.order_by(Subject.name).all()])
@app.route('/api/subjects/<int:subject_id>/solutions', methods=['GET'])
def get_solutions_for_subject(subject_id): return jsonify([s.to_dict_public() for s in Solution.query.filter_by(subject_id=subject_id).order_by(Solution.date_created.desc()).all()])
@app.route('/api/solutions/<int:solution_id>', methods=['GET'])
def get_solution_detail(solution_id): return jsonify(Solution.query.get_or_404(solution_id).to_dict_detail())

# --- Admin-Only Routes ---
@app.route('/api/admin/users', methods=['GET', 'POST'])
@admin_required
def handle_users(current_user):
    if request.method == 'GET': return jsonify([u.to_dict() for u in User.query.all()])
    if request.method == 'POST': 
        data=request.get_json(); new_user=User(username=data['username'], role=data.get('role', 'user')); new_user.set_password(data['password'])
        db.session.add(new_user); db.session.commit(); 
        log_activity(current_user, f"สร้างผู้ใช้ใหม่: {new_user.username} (Role: {new_user.role})")
        return jsonify(new_user.to_dict()), 201

@app.route('/api/admin/users/<int:user_id>', methods=['PUT', 'DELETE'])
@admin_required
def handle_user(current_user, user_id):
    user = User.query.get_or_404(user_id)
    if request.method == 'PUT': 
        data=request.get_json(); user.username=data.get('username',user.username); user.role=data.get('role',user.role);
        if data.get('password'): user.set_password(data['password'])
        db.session.commit();
        log_activity(current_user, f"แก้ไขข้อมูลผู้ใช้ ID: {user_id} ({user.username})")
        return jsonify(user.to_dict())
    if request.method == 'DELETE':
        if user.id == 1: return jsonify({"message": "Cannot delete primary admin account"}), 403
        log_activity(current_user, f"ลบผู้ใช้ ID: {user_id} ({user.username})")
        db.session.delete(user); db.session.commit(); 
        return jsonify({"message": "User deleted"})

@app.route('/api/admin/subjects', methods=['GET', 'POST'])
@admin_required
def handle_admin_subjects(current_user):
    if request.method == 'GET': return jsonify([s.to_dict() for s in Subject.query.order_by(Subject.id).all()])
    if request.method == 'POST': 
        data=request.get_json(); new_subject=Subject(name=data['name'], icon=data.get('icon', '📝'))
        db.session.add(new_subject); db.session.commit(); 
        log_activity(current_user, f"สร้างวิชาใหม่: {new_subject.name}")
        return jsonify(new_subject.to_dict()), 201

@app.route('/api/admin/subjects/<int:subject_id>', methods=['PUT', 'DELETE'])
@admin_required
def handle_admin_subject(current_user, subject_id):
    subject = Subject.query.get_or_404(subject_id)
    if request.method == 'PUT': 
        data=request.get_json(); subject.name=data.get('name', subject.name); subject.icon=data.get('icon', subject.icon)
        db.session.commit(); 
        log_activity(current_user, f"แก้ไขวิชา: {subject.name}")
        return jsonify(subject.to_dict())
    if request.method == 'DELETE':
        log_activity(current_user, f"ลบวิชา: {subject.name}")
        db.session.delete(subject); db.session.commit(); 
        return jsonify({"message": "Subject deleted"})

# --- Moderator & Admin Routes ---
@app.route('/api/admin/solutions', methods=['GET', 'POST'])
@moderator_or_admin_required
def handle_solutions(current_user):
    if request.method == 'GET':
        return jsonify([s.to_dict_admin() for s in Solution.query.order_by(Solution.date_created.desc()).all()])
    if request.method == 'POST':
        data=request.get_json(); new_solution=Solution(title=data['title'], subject_id=data['subject_id'], content=data.get('content'), creator_id=current_user.id)
        db.session.add(new_solution); db.session.commit()
        log_activity(current_user, f"สร้างเฉลยใหม่: {new_solution.title}")
        return jsonify(new_solution.to_dict_admin()), 201

@app.route('/api/admin/solutions/<int:solution_id>', methods=['GET','PUT', 'DELETE'])
@moderator_or_admin_required
def handle_solution(current_user, solution_id):
    solution = Solution.query.get_or_404(solution_id)
    if current_user.role == 'moderator' and solution.creator_id != current_user.id: return jsonify({'message': 'คุณไม่มีสิทธิ์แก้ไขเฉลยของผู้อื่น'}), 403
    if request.method == 'GET': return jsonify(solution.to_dict_admin())
    if request.method == 'PUT': 
        data=request.get_json(); solution.title=data.get('title', solution.title); solution.subject_id=data.get('subject_id', solution.subject_id); solution.content=data.get('content', solution.content); 
        db.session.commit(); 
        log_activity(current_user, f"แก้ไขเฉลย: {solution.title}")
        return jsonify(solution.to_dict_admin())
    if request.method == 'DELETE': 
        log_activity(current_user, f"ลบเฉลย: {solution.title}")
        db.session.delete(solution); db.session.commit(); 
        return jsonify({"message": "Solution deleted"})

@app.route('/api/admin/solutions/<int:solution_id>/upload', methods=['POST'])
@moderator_or_admin_required
def upload_solution_file(current_user, solution_id):
    solution = Solution.query.get_or_404(solution_id)
    if current_user.role == 'moderator' and solution.creator_id != current_user.id: return jsonify({'message': 'คุณไม่มีสิทธิ์แก้ไขไฟล์ของเฉลยผู้อื่น'}), 403
    file = request.files.get('file');
    if not file or file.filename == '': return jsonify({"message": "No file selected"}), 400
    filename = secure_filename(f"{solution_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}")
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename)); solution.file_path = f"/uploads/{filename}"; 
    db.session.commit()
    log_activity(current_user, f"อัปโหลดไฟล์สำหรับเฉลย: {solution.title}")
    return jsonify({"message": "File uploaded", "file_path": solution.file_path})

# --- NEW LOGGING API ENDPOINTS ---
@app.route('/api/admin/login-history', methods=['GET'])
@admin_required
def get_login_history(current_user):
    logs = LoginHistory.query.order_by(LoginHistory.timestamp.desc()).limit(100).all()
    return jsonify([log.to_dict() for log in logs])

@app.route('/api/admin/activity-logs', methods=['GET'])
@admin_required
def get_activity_logs(current_user):
    logs = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(100).all()
    return jsonify([log.to_dict() for log in logs])

# --- Database Setup ---
def setup_database(app):
    with app.app_context():
        db.create_all()
        if not User.query.first(): 
            print("Creating initial users...")
            admin_user=User(username='admin', role='admin'); admin_user.set_password('admin123')
            mod_user=User(username='moderator', role='moderator'); mod_user.set_password('mod123')
            db.session.add(admin_user); db.session.add(mod_user)
            db.session.commit(); 
            print("Admin and Moderator users created.")

setup_database(app)
if __name__ == '__main__':
    app.run(debug=True)
