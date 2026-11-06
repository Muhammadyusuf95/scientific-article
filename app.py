import os
import time
from flask import Flask, request, render_template, redirect, url_for, flash, make_response, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Article, Author, User
import firebase_admin
from firebase_admin import credentials, storage
from functools import wraps

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit')

# --- ADMIN LOGIN VA PAROL ---
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'parol123')

FIREBASE_KEY_PATH = os.getenv('FIREBASE_KEY_PATH', 'firebase_key.json')
FIREBASE_BUCKET = 'scientific-article-22107.firebasestorage.app'

if not firebase_admin._apps:
    try:
        cred = credentials.Certificate(FIREBASE_KEY_PATH)
        firebase_admin.initialize_app(cred, {'storageBucket': FIREBASE_BUCKET})
    except Exception as e:
        print(f"Firebase ulanishida xatolik: {e}")

db.init_app(app)

# Baza jadvallarini avtomatik yaratish
with app.app_context():
    try:
        db.create_all()
        print("Ma'lumotlar bazasi jadvallari muvaffaqiyatli tekshirildi/yaratildi!")
    except Exception as e:
        print(f"Baza yaratishda xatolik: {e}")

# --- DEKORATORLAR (Xavfsizlik) ---
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin'):
            flash("Bu sahifaga kirish uchun admin sifatida kiring!", "danger")
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Maqolani yuklab olish uchun avval tizimga kiring yoki ro'yxatdan o'ting!", "warning")
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- ASOSIY SAHIFA (Yil va sonlar bo'yicha tartibli) ---
@app.route('/')
def index():
    query = request.args.get('q', '')
    if query:
        articles = Article.query.filter(
            (Article.title_uz.ilike(f'%{query}%')) | 
            (Article.title_en.ilike(f'%{query}%')) | 
            (Article.title_ru.ilike(f'%{query}%'))
        ).order_by(Article.year.desc(), Article.issue.desc()).all()
    else:
        # Eng yangi yil va son bo'yicha tartiblab chiqarish
        articles = Article.query.order_by(Article.year.desc(), Article.issue.desc(), Article.created_at.desc()).all()
    return render_template('index.html', articles=articles, query=query)

# --- MAQOLA TAFSILOTI ---
@app.route('/article/<int:article_id>')
def article_detail(article_id):
    article = Article.query.get_or_404(article_id)
    article.views_count += 1
    db.session.commit()
    return render_template('article.html', article=article)

# --- YUKLAB OLISH (Faqat ro'yxatdan o'tganlar uchun) ---
@app.route('/download/<int:article_id>')
@login_required
def download_article(article_id):
    article = Article.query.get_or_404(article_id)
    article.downloads_count += 1
    db.session.commit()
    return redirect(article.pdf_filename)

# --- ADMIN LOGIN ---
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session['is_admin'] = True
            flash("Admin panelga xush kelibsiz!", "success")
            return redirect(url_for('add_article'))
        else:
            flash("Login yoki parol xato!", "danger")
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('is_admin', None)
    flash("Admin tizimidan chiqildi.", "info")
    return redirect(url_for('index'))

# --- FOYDALANUVCHI RO'YXATDAN O'TISHI (REGISTER) ---
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user_exists = User.query.filter_by(username=username).first()
        if user_exists:
            flash("Bu foydalanuvchi nomi band qilingan!", "danger")
            return redirect(url_for('register'))
            
        hashed_password = generate_password_hash(password)
        new_user = User(username=username, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()
        
        flash("Muvaffaqiyatli ro'yxatdan o'tdingiz! Endi kiring.", "success")
        return redirect(url_for('login'))
        
    return render_template('register.html')

# --- FOYDALANUVCHI TIZIMGA KIRISHI (LOGIN) ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password, password):
            session['user_id'] = user.id
            session['username'] = user.username
            flash("Tizimga muvaffaqiyatli kirdingiz!", "success")
            return redirect(url_for('index'))
        else:
            flash("Login yoki parol xato!", "danger")
            
    return render_template('login.html')

# --- PAROLNI TIKLASH (UNUTGANDA) ---
@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        username = request.form.get('username')
        new_password = request.form.get('new_password')
        
        user = User.query.filter_by(username=username).first()
        if user:
            user.password = generate_password_hash(new_password)
            db.session.commit()
            flash("Parolingiz muvaffaqiyatli yangilandi! Yangi parol bilan kiring.", "success")
            return redirect(url_for('login'))
        else:
            flash("Bunday foydalanuvchi topilmadi!", "danger")
            
    return render_template('forgot_password.html')

# --- FOYDALANUVCHI TIZIMDAN CHIQISHI ---
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    flash("Tizimdan chiqdingiz.", "info")
    return redirect(url_for('index'))

# --- MAQOLA QO'SHISH (Faqat Admin uchun - Yil va Son bilan) ---
@app.route('/admin/add', methods=['GET', 'POST'])
@admin_required
def add_article():
    if request.method == 'POST':
        try:
            title_uz = request.form.get('title_uz')
            title_en = request.form.get('title_en')
            title_ru = request.form.get('title_ru')
            
            abstract_uz = request.form.get('abstract_uz')
            abstract_en = request.form.get('abstract_en')
            abstract_ru = request.form.get('abstract_ru')
            
            keywords_uz = request.form.get('keywords_uz')
            keywords_en = request.form.get('keywords_en')
            keywords_ru = request.form.get('keywords_ru')
            
            doi = request.form.get('doi')
            year = request.form.get('year', type=int) or 2026
            volume = request.form.get('volume', type=int) or 1
            issue = request.form.get('issue', type=int) or 1
            pages = request.form.get('pages')
            
            authors_input = request.form.get('authors')
            pdf_file = request.files.get('pdf_file')
            
            if not pdf_file or pdf_file.filename == '':
                flash("Iltimos, PDF faylni biriktiring!", "danger")
                return redirect(url_for('add_article'))

            filename = f"{int(time.time())}_{secure_filename(pdf_file.filename)}"
            
            # Firebase ga yuklash
            bucket = storage.bucket()
            blob = bucket.blob(f"articles/{filename}")
            blob.upload_from_string(pdf_file.read(), content_type='application/pdf')
            blob.make_public()
            public_url = blob.public_url
            
            # Maqolani bazaga saqlash
            new_article = Article(
                title_uz=title_uz, title_en=title_en, title_ru=title_ru,
                abstract_uz=abstract_uz, abstract_en=abstract_en, abstract_ru=abstract_ru,
                keywords_uz=keywords_uz, keywords_en=keywords_en, keywords_ru=keywords_ru,
                doi=doi, year=year, volume=volume, issue=issue, pages=pages,
                pdf_filename=public_url
            )
            db.session.add(new_article)
            db.session.commit()
            
            # Mualliflarni qo'shish
            if authors_input:
                author_names = authors_input.split(',')
                for idx, name in enumerate(author_names):
                    if name.strip():
                        new_author = Author(full_name=name.strip(), order_index=idx+1, article_id=new_article.id)
                        db.session.add(new_author)
                db.session.commit()
            
            flash("Maqola muvaffaqiyatli qo'shildi va chop etildi!", "success")
            return redirect(url_for('add_article'))
            
        except Exception as e:
            print(f"Maqola qo'shish xatoligi: {str(e)}")
            flash(f"Xatolik yuz berdi: {str(e)}", "danger")
            return redirect(url_for('add_article'))
                
    return render_template('admin_add.html')

# --- SITEMAP ---
@app.route('/sitemap.xml')
def sitemap():
    base_url = "https://scientific-article.onrender.com"
    
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    xml_content += f'  <url>\n    <loc>{base_url}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n'
    
    try:
        articles = Article.query.all()
        for article in articles:
            lastmod = article.created_at.strftime('%Y-%m-%d') if hasattr(article, 'created_at') and article.created_at else '2026-11-05'
            xml_content += f'  <url>\n'
            xml_content += f'    <loc>{base_url}/article/{article.id}</loc>\n'
            xml_content += f'    <lastmod>{lastmod}</lastmod>\n'
            xml_content += f'    <changefreq>weekly</changefreq>\n'
            xml_content += f'    <priority>0.8</priority>\n'
            xml_content += f'  </url>\n'
    except Exception as e:
        print(f"Sitemap xatoligi: {e}")
        
    xml_content += '</urlset>'
    
    response = make_response(xml_content)
    response.headers["Content-Type"] = "application/xml"
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
