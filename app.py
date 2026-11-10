import os
import time
import boto3
from flask import Flask, request, render_template, redirect, url_for, flash, make_response, session, Response, stream_with_context
from werkzeug.utils import secure_filename
from flask_wtf.csrf import CSRFProtect
from models import db, Article, Author, User, Collection
from functools import wraps
from sqlalchemy import text

app = Flask(__name__)

# --- 1. XAVFSIZLIK VA COOKIE SOZLAMALARI ---
app.config.update(
    SESSION_COOKIE_SECURE=True,      # Faqat HTTPS orqali ishlaydi
    SESSION_COOKIE_HTTPONLY=True,    # JavaScript orqali o'g'irlashdan saqlaydi
    SESSION_COOKIE_SAMESITE='Lax',
)

app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit_uchun_tasodifiy_satr')

# CSRF himoyasini yoqish
csrf = CSRFProtect(app)

ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'Muhammadyusuf')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'Muhammadyusuf95')

# --- 2. XAVFSIZLIK SARLAVHALARI (SECURITY HEADERS) ---
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "frame-src 'self';"
    )
    return response

# --- 3. DATABASE VA R2 SOZLAMALARI ---
db_url = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL', 'https://b828117b95ed9d61c82ed59a87d6290e.r2.cloudflarestorage.com')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', 'ac38a96c402e0c4e919cdd96554cfa6b')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', 'b218b5c0d690c92f0d2ef49cde3b182be3b83be1fff97059b99ab0d221ab606e')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'scientific-article')

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
        db.session.execute(text('ALTER TABLE article ADD COLUMN IF NOT EXISTS "references" TEXT;'))
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS publisher VARCHAR(255) DEFAULT 'Ilmiy Maqolalar Portali';"))
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS institution VARCHAR(255) DEFAULT 'O''zbek tilshunosligi kafedrasi';"))
        db.session.execute(text("ALTER TABLE article ADD COLUMN IF NOT EXISTS issn VARCHAR(50) DEFAULT '0000-0000';"))
        db.session.execute(text("ALTER TABLE collection ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Migratsiya xatosi: {e}")

@app.template_filter('clean_doi')
def clean_doi(doi_str):
    if not doi_str:
        return ""
    doi_str = doi_str.strip()
    for prefix in ['https://doi.org/', 'http://doi.org/', 'doi:']:
        if doi_str.lower().startswith(prefix):
            doi_str = doi_str[len(prefix):]
    return doi_str

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin'):
            flash("Bu sahifaga kirish uchun admin sifatida kiring!", "danger")
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def is_bot():
    user_agent = request.headers.get('User-Agent', '').lower()
    bots = ['googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot', 'slurp', 'crawler', 'spider', 'bot', 'uptimerobot']
    return any(b in user_agent for b in bots)

# --- 4. ASOSIY MARSHRUTLAR ---
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

@app.route('/article/<int:id>')
def article_detail(id):
    article = Article.query.get_or_404(id)
    try:
        if not is_bot():
            session_key = f"viewed_article_{id}"
            if not session.get(session_key):
                article.views_count = (article.views_count or 0) + 1
                db.session.commit()
                session[session_key] = True
    except Exception:
        db.session.rollback()

    collection = article.collection if hasattr(article, 'collection') else None
    return render_template('article.html', article=article, collection=collection)

# --- 5. OQIMLI (STREAMING) PDF O'QISH VA YUKLAB OLISH ---
@app.route('/pdf/<int:id>.pdf')
def serve_pdf(id):
    article = Article.query.get_or_404(id)
    filename = article.pdf_filename.split('/')[-1].split('?')[0]
    
    range_header = request.headers.get('Range')
    kwargs = {}
    if range_header:
        kwargs['Range'] = range_header

    try:
        s3_obj = s3_client.get_object(Bucket=R2_BUCKET_NAME, Key=filename, **kwargs)
    except Exception:
        return "Fayl topilmadi", 404

    response = Response(
        stream_with_context(s3_obj['Body'].iter_chunks()),
        status=s3_obj.get('ResponseMetadata', {}).get('HTTPStatusCode', 200),
        content_type='application/pdf',
        direct_passthrough=True
    )
    
    response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
    if 'Content-Range' in s3_obj:
        response.headers['Content-Range'] = s3_obj['Content-Range']
    if 'Accept-Ranges' in s3_obj:
        response.headers['Accept-Ranges'] = s3_obj['Content-Length']
    response.headers['Content-Length'] = s3_obj['ContentLength']
    
    return response

@app.route('/download/<int:id>')
def download_article(id):
    article = Article.query.get_or_404(id)
    
    try:
        if not is_bot():
            Article.query.filter_by(id=id).update({"downloads_count": (Article.downloads_count or 0) + 1})
            db.session.commit()
    except Exception:
        db.session.rollback()

    filename = article.pdf_filename.split('/')[-1].split('?')[0]
    
    try:
        s3_obj = s3_client.get_object(Bucket=R2_BUCKET_NAME, Key=filename)
    except Exception:
        return "Fayl topilmadi", 404

    response = Response(
        stream_with_context(s3_obj['Body'].iter_chunks()),
        status=200,
        content_type='application/pdf',
        direct_passthrough=True
    )
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.headers['Content-Length'] = s3_obj['ContentLength']
    
    return response

# --- 6. ADMIN VA MAQOLA BOSHQARUVI ---
@app.route('/article/edit/<int:article_id>', methods=['GET', 'POST'])
@admin_required
def edit_article(article_id):
    article = Article.query.get_or_404(article_id)
    collections = Collection.query.all()
    
    if request.method == 'POST':
        try:
            article.title_uz = request.form.get('title_uz')
            article.title_en = request.form.get('title_en')
            article.title_ru = request.form.get('title_ru')
            
            article.abstract_uz = request.form.get('abstract_uz')
            article.abstract_en = request.form.get('abstract_en')
            article.abstract_ru = request.form.get('abstract_ru')
            
            article.keywords_uz = request.form.get('keywords_uz')
            article.keywords_en = request.form.get('keywords_en')
            article.keywords_ru = request.form.get('keywords_ru')
            
            article.references = request.form.get('references')
            article.doi = request.form.get('doi')
            article.year = request.form.get('year', type=int) or 2026
            article.volume = request.form.get('volume', type=int) or 1
            article.issue = request.form.get('issue', type=int) or 1
            article.pages = request.form.get('pages')
            
            collection_name = request.form.get('collection_name', '').strip()
            if collection_name:
                collection = Collection.query.filter_by(name=collection_name).first()
                if not collection:
                    collection = Collection(name=collection_name)
                    db.session.add(collection)
                    db.session.commit()
                article.collection_id = collection.id
            
            pdf_file = request.files.get('pdf_file')
            if pdf_file and pdf_file.filename != '':
                header = pdf_file.stream.read(1024)
                pdf_file.stream.seek(0)
                if not header.startswith(b'%PDF-'):
                    flash("Yuklangan fayl haqiqiy PDF emas!", "danger")
                    return redirect(request.url)

                filename = f"{int(time.time())}_{secure_filename(pdf_file.filename)}"
                s3_client.upload_fileobj(
                    pdf_file,
                    R2_BUCKET_NAME,
                    filename,
                    ExtraArgs={'ContentType': 'application/pdf'}
                )
                article.pdf_filename = f"https://pub-21eece65689f4ee39fbe5b16812adb10.r2.dev/{filename}"

            db.session.commit()
            flash("Maqola muvaffaqiyatli tahrirlandi!", "success")
            return redirect(url_for('article_detail', id=article.id))
        except Exception as e:
            db.session.rollback()
            flash(f"Tahrirlashda xatolik: {str(e)}", "danger")
            
    return render_template('admin_edit.html', article=article, collections=collections)

@app.route('/collection/delete/<int:collection_id>', methods=['POST'])
@admin_required
def delete_collection(collection_id):
    collection = Collection.query.get_or_404(collection_id)
    try:
        Article.query.filter_by(collection_id=collection.id).update({'collection_id': None})
        db.session.delete(collection)
        db.session.commit()
        flash("To'plam muvaffaqiyatli o'chirildi!", "success")
    except Exception as e:
        db.session.rollback()
        flash(f"Xatolik: {str(e)}", "danger")
    return redirect(url_for('index'))

@app.route('/article/delete/<int:article_id>', methods=['POST'])
@admin_required
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    try:
        db.session.delete(article)
        db.session.commit()
        flash("Maqola muvaffaqiyatli o'chirildi!", "success")
    except Exception as e:
        flash(f"Xatolik: {str(e)}", "danger")
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

            header = pdf_file.stream.read(1024)
            pdf_file.stream.seek(0)
            if not header.startswith(b'%PDF-'):
                flash("Yuklangan fayl haqiqiy PDF emas!", "danger")
                return redirect(url_for('add_article'))

            filename = f"{int(time.time())}_{secure_filename(pdf_file.filename)}"
            s3_client.upload_fileobj(
                pdf_file,
                R2_BUCKET_NAME,
                filename,
                ExtraArgs={'ContentType': 'application/pdf'}
            )
            
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
            flash(f"Xatolik yuz berdi: {str(e)}", "danger")
            return redirect(url_for('add_article'))
            
    collections = Collection.query.all()
    return render_template('admin_add.html', collections=collections)

# --- 7. SEO: ROBOTS.TXT, SITEMAP.XML VA XATOLAR HANDLERI ---
@app.route('/robots.txt')
def robots_txt():
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Allow: /article/\n"
        "Allow: /collection/\n"
        "Allow: /pdf/\n"
        "Disallow: /admin/\n"
        "Disallow: /admin/login\n"
        "Disallow: /*?q=*\n\n"
        "Sitemap: https://scientific-article.onrender.com/sitemap.xml"
    )
    return response_with_type(content, "text/plain")

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
    return response_with_type(xml_content, "application/xml")

def response_with_type(content, ctype):
    response = make_response(content)
    response.headers["Content-Type"] = ctype
    return response

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('500.html'), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)

# --- STATIK AXBOROT SAHIFALARI ---
@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/editorial-board')
def editorial_board():
    return render_template('editorial_board.html')

@app.route('/ethics')
def ethics():
    return render_template('ethics.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')
