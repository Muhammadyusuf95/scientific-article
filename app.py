import os
import time
import boto3
from flask import Flask, request, render_template, redirect, url_for, flash, make_response, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Article, Author, User, Collection
from functools import wraps
from sqlalchemy import text

app = Flask(__name__)
# Cookie xavfsizligi
app.config.update(
    SESSION_COOKIE_SECURE=True,      # Faqat HTTPS orqali ishlaydi
    SESSION_COOKIE_HTTPONLY=True,    # JavaScript orqali o'g'irlashdan saqlaydi
    SESSION_COOKIE_SAMESITE='Lax',
)

@app.template_filter('clean_doi')
def clean_doi(doi_str):
    if not doi_str:
        return ""
    # Agar DOI to'liq URL shaklida kiritilgan bo'lsa, prefikslarni tozalab tashlaymiz
    doi_str = doi_str.strip()
    for prefix in ['https://doi.org/', 'http://doi.org/', 'doi:']:
        if doi_str.lower().startswith(prefix):
            doi_str = doi_str[len(prefix):]
    return doi_str
    
# Xavfsizlik sarlavhalari (Security Headers)
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

db_url = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit')

ADMIN_USERNAME = 'Muhammadyusuf'
ADMIN_PASSWORD = 'Muhammadyusuf95'

import requests

@app.route('/migrate-old-articles')
def migrate_old_articles():
    try:
        articles = Article.query.all()
        count = 0
        for article in articles:
            old_url = article.pdf_filename
            
            # Agar allaqachon R2 ga o'tgan bo'lsa, o'tkazib yuboramiz
            if "r2.dev" in old_url:
                continue
                
            filename = old_url.split('/')[-1].split('?')[0]
            if not filename:
                continue
            
            # Eski Firebase havolasidan faylni yuklab olamiz
            response = requests.get(old_url)
            if response.status_code == 200:
                file_bytes = response.content
                
                # Cloudflare R2 ga yuklaymiz
                s3_client.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=filename,
                    Body=file_bytes,
                    ContentType='application/pdf'
                )
                
                # Ma'lumotlar bazasidagi havolani yangi R2 manziliga o'zgartiramiz
                article.pdf_filename = f"https://pub-21eece65689f4ee39fbe5b16812adb10.r2.dev/{filename}"
                db.session.commit()
                count += 1
                
        return f"Muvaffaqiyatli! Jami {count} ta eski maqola Cloudflare R2 ga ko'chirildi va baza yangilandi."
    except Exception as e:
        return f"Xatolik yuz berdi: {str(e)}"

# --- CLOUDFLARE R2 SOZLAMALARI ---
R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL', 'https://b828117b95ed9d61c82ed59a87d6290e.r2.cloudflarestorage.com')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', 'ac38a96c402e0c4e919cdd96554cfa6b')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', 'b218b5c0d690c92f0d2ef49cde3b182be3b83be1fff97059b99ab0d221ab606e')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'scientific-article')

# S3 client ni sozlash (Cloudflare R2 uchun)
s3_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
        try:
            db.session.execute(text('ALTER TABLE article ADD COLUMN IF NOT EXISTS "references" TEXT;'))
            db.session.commit()
        except Exception:
            db.session.rollback()
        print("Ma'lumotlar bazasi jadvallari muvaffaqiyatli tekshirildi/yaratildi!")
    except Exception as e:
        print(f"Baza yaratishda xatolik: {e}")

from sqlalchemy import text

with app.app_context():
    db.create_all()
    # Bazada yetishmayotgan ustunlarni avtomatik qo'shish (Migration)
    try:
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS publisher VARCHAR(255) DEFAULT 'Ilmiy Maqolalar Portali';"))
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS institution VARCHAR(255) DEFAULT 'O''zbek tilishunosligi kafedrasi';"))
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS issn VARCHAR(50) DEFAULT '0000-0000';"))
        db.session.execute(text("ALTER TABLE collection ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print("Migratsiya xatosi:", e)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin'):
            flash("Bu sahifaga kirish uchun admin sifatida kiring!", "danger")
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

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

@app.route('/collection/<int:collection_id>')
def collection_detail(collection_id):
    collection = Collection.query.get_or_404(collection_id)
    articles = Article.query.filter_by(collection_id=collection.id).order_by(Article.year.desc()).all()
    collections = Collection.query.order_by(Collection.created_at.desc()).all()
    return render_template('collection.html', collection=collection, articles=articles, collections=collections)

@app.route('/article/<int:article_id>')
def article_detail(article_id):
    article = Article.query.get_or_404(article_id)
    # Ko'rishlar sonini avtomatik oshiramiz (login talab qilinmaydi)
    article.views_count += 1
    db.session.commit()
    return render_template('article.html', article=article, collection=article.collection)

@app.route('/download/<int:article_id>')
def download_article(article_id):
    article = Article.query.get_or_404(article_id)
    # Yuklab olishlar sonini oshiramiz
    article.downloads_count += 1
    db.session.commit()
    
    # Faylni foydalanuvchiga yoki botga to'g'ridan-to'g'ri ochib beramiz (R2 havolasi yoki local path)
    return redirect(article.pdf_filename)
        
    article = Article.query.get_or_404(article_id)
    article.downloads_count += 1
    db.session.commit()
    return redirect(article.pdf_filename)

# --- GOOGLE SEARCH CONSOLE TASDIQLASH ---
@app.route('/google35a149858ebe2d59.html')
def google_verification():
    return "google-site-verification: google35a149858ebe2d59.html"

# --- MAQOLANI O'CHIRISH (Faqat Admin uchun) ---
@app.route('/article/delete/<int:article_id>', methods=['POST'])
@admin_required
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    try:
        db.session.delete(article)
        db.session.commit()
        flash("Maqola muvaffaqiyatli o'chirildi!", "success")
    except Exception as e:
        flash(f"O'chirishda xatolik: {str(e)}", "danger")
    return redirect(url_for('index'))

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
            
            # --- CLOUDFLARE R2 GA YUKLASH ---
            s3_client.upload_fileobj(
                pdf_file,
                R2_BUCKET_NAME,
                filename,
                ExtraArgs={'ContentType': 'application/pdf'}
            )
            
            # R2 dagi fayl uchun ochiq havola
            # Eslatma: Agar R2 uchun Custom Domain ulagan bo'lsangiz, shu yerdagi havolani o'zgartirishingiz mumkin.
            # Hozircha standart R2 dev / endpoint havolasi yoki to'g'ridan-to'g'ri URL shakllantiriladi:
            public_url = f"https://pub-21eece65689f4ee39fbe5b16812adb10.r2.dev/{filename}"
            
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
