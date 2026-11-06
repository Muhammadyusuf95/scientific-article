import os
import time
from flask import Flask, request, render_template, redirect, url_for, flash, make_response, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Article, Author, User, Collection
import firebase_admin
from firebase_admin import credentials, storage
from functools import wraps
from sqlalchemy import text

app = Flask(__name__)

# Baza manzilini to'g'rilash (PostgreSQL uchun psycopg2 drayverini majburlash)
db_url = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit')

# --- ADMIN LOGIN VA PAROL ---
ADMIN_USERNAME = 'Muhammadyusuf'
ADMIN_PASSWORD = 'Muhammadyusuf95'

# --- FIREBASE SOZLAMALARI ---
FIREBASE_BUCKET = 'scientific-article-22107.firebasestorage.app'

if os.path.exists('/etc/secrets/firebase_key.json'):
    FIREBASE_KEY_PATH = '/etc/secrets/firebase_key.json'
else:
    FIREBASE_KEY_PATH = 'firebase_key.json'

if not firebase_admin._apps:
    try:
        cred = credentials.Certificate(FIREBASE_KEY_PATH)
        firebase_admin.initialize_app(cred, {'storageBucket': FIREBASE_BUCKET})
        print("Firebase muvaffaqiyatli ishga tushdi!")
    except Exception as e:
        print(f"Firebase ulanishida xatolik: {e}")

db.init_app(app)

# Baza jadvallarini va yetishmayotgan ustunlarni avtomatik yaratish/yangilash
with app.app_context():
    try:
        db.create_all()
        # PostgreSQL uchun references ustuni yo'q bo'lsa qo'shish
        try:
            db.session.execute(text('ALTER TABLE article ADD COLUMN IF NOT EXISTS "references" TEXT;'))
            db.session.commit()
        except Exception:
            db.session.rollback()
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

# --- ASOSIY SAHIFA ---
@app.route('/')
def index():
    query = request.args.get('q', '')
    collections = Collection.query.order_by(Collection.created_at.desc()).all()
    
    if query:
        articles = Article.query.filter(
            (Article.title_uz.ilike(f'%{query}%')) | 
            (Article.title_en.ilike(f'%{query}%')) | 
            (Article.title_ru.ilike(f'%{query}%'))
        ).order_by(Article.year.desc(), Article.issue.desc()).all()
    else:
        articles = Article.query.order_by(Article.year.desc(), Article.issue.desc(), Article.created_at.desc()).all()
        
    return render_template('index.html', articles=articles, collections=collections, query=query)

# --- TO'PLAM SAHIFASI ---
@app.route('/collection/<int:collection_id>')
def collection_detail(collection_id):
    collection = Collection.query.get_or_404(collection_id)
    articles = Article.query.filter_by(collection_id=collection.id).order_by(Article.year.desc()).all()
    return render_template('collection.html', collection=collection, articles=articles)

# --- MAQOLA TAFSILOTI VA ONLAYN O'QISH ---
@app.route('/article/<int:article_id>')
def article_detail(article_id):
    article = Article.query.get_or_404(article_id)
    article.views_count += 1
    db.session.commit()
    return render_template('article.html', article=article)

# --- YUKLAB OLISH ---
@app.route('/download/<int:article_id>')
def download_article(article_id):
    article = Article.query.get_or_404(article_id)
    article.downloads_count += 1
    db.session.commit()
    return redirect(article.pdf_filename)

# --- MAQOLANI O'CHIRISH (Admin uchun) ---
@app.route('/article/delete/<int:article_id>', methods=['POST'])
@admin_required
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    try:
        db.session.delete(article)
        db.session.commit()
        flash("Maqola muvaffaqiyatli o'chirildi!", "success")
    except Exception as e:
        flash(f"O'chirishda xatolik yuz berdi: {str(e)}", "danger")
    return redirect(url_for('index'))

# --- ADMIN LOGIN ---
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
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

# --- REGISTER / LOGIN ---
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

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    flash("Tizimdan chiqdingiz.", "info")
    return redirect(url_for('index'))

# --- MAQOLA QO'SHISH ---
@app.route('/admin/add', methods=['GET', 'POST'])
@admin_required
def add_article():
    if request.method == 'POST':
        try:
            collection_name = request.form.get('collection_name', '').strip()
            collection_id = None
            
            if collection_name:
                collection = Collection.query.filter_by(name=collection_name).first()
                if not collection:
                    collection = Collection(name=collection_name)
                    db.session.add(collection)
                    db.session.commit()
                collection_id = collection.id

            title_uz = request.form.get('title_uz')
            title_en = request.form.get('title_en')
            title_ru = request.form.get('title_ru')
            
            abstract_uz = request.form.get('abstract_uz')
            abstract_en = request.form.get('abstract_en')
            abstract_ru = request.form.get('abstract_ru')
            
            keywords_uz = request.form.get('keywords_uz')
            keywords_en = request.form.get('keywords_en')
            keywords_ru = request.form.get('keywords_ru')
            
            references_text = request.form.get('references')
            
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
            
            bucket = storage.bucket()
            blob = bucket.blob(f"articles/{filename}")
            blob.upload_from_string(pdf_file.read(), content_type='application/pdf')
            blob.make_public()
            public_url = blob.public_url
            
            new_article = Article(
                collection_id=collection_id,
                title_uz=title_uz, title_en=title_en, title_ru=title_ru,
                abstract_uz=abstract_uz, abstract_en=abstract_en, abstract_ru=abstract_ru,
                keywords_uz=keywords_uz, keywords_en=keywords_en, keywords_ru=keywords_ru,
                references=references_text,
                doi=doi, year=year, volume=volume, issue=issue, pages=pages,
                pdf_filename=public_url
            )
            db.session.add(new_article)
            db.session.commit()
            
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
            
    collections = Collection.query.all()
    return render_template('admin_add.html', collections=collections)

# --- SITEMAP ---
@app.route('/sitemap.xml')
def sitemap():
    base_url = "https://scientific-article.onrender.com"
    
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    xml_content += f'  <url>\n    <loc>{base_url}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n'
    
    try:
        collections = Collection.query.all()
        for collection in collections:
            xml_content += f'  <url>\n    <loc>{base_url}/collection/{collection.id}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n'

        articles = Article.query.all()
        for article in articles:
            lastmod = article.created_at.strftime('%Y-%m-%d') if hasattr(article, 'created_at') and article.created_at else '2026-11-05'
            xml_content += f'  <url>\n'
            xml_content += f'    <loc>{base_url}/article/{article.id}</loc>\n'
            xml_content += f'    <lastmod>{lastmod}</lastmod>\n'
            xml_content += f'    <changefreq>monthly</changefreq>\n'
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
