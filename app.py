import os
import time
from flask import Flask, request, render_template, redirect, url_for, flash, make_response
from werkzeug.utils import secure_filename
from models import db, Article, Author
import firebase_admin
from firebase_admin import credentials, storage

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit')

FIREBASE_KEY_PATH = os.getenv('FIREBASE_KEY_PATH', 'firebase_key.json')
FIREBASE_BUCKET = 'scientific-article-22107.firebasestorage.app'

if not firebase_admin._apps:
    try:
        cred = credentials.Certificate(FIREBASE_KEY_PATH)
        firebase_admin.initialize_app(cred, {'storageBucket': FIREBASE_BUCKET})
    except Exception as e:
        print(f"Firebase ulanishida xatolik: {e}")

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"Baza yaratishda xatolik: {e}")

@app.route('/')
def index():
    query = request.args.get('q', '')
    if query:
        articles = Article.query.filter(
            (Article.title_uz.ilike(f'%{query}%')) | 
            (Article.title_en.ilike(f'%{query}%')) | 
            (Article.title_ru.ilike(f'%{query}%'))
        ).all()
    else:
        articles = Article.query.order_by(Article.created_at.desc()).all()
    return render_template('index.html', articles=articles, query=query)

@app.route('/article/<int:article_id>')
def article_detail(article_id):
    article = Article.query.get_or_404(article_id)
    article.views_count += 1
    db.session.commit()
    return render_template('article.html', article=article)

@app.route('/download/<int:article_id>')
def download_article(article_id):
    article = Article.query.get_or_404(article_id)
    article.downloads_count += 1
    db.session.commit()
    return redirect(article.pdf_filename)

@app.route('/admin/add', methods=['GET', 'POST'])
def add_article():
    if request.method == 'POST':
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
        authors_input = request.form.get('authors')
        pdf_file = request.files.get('pdf_file')
        
        if pdf_file and pdf_file.filename != '':
            filename = f"{int(time.time())}_{secure_filename(pdf_file.filename)}"
            try:
                bucket = storage.bucket()
                blob = bucket.blob(f"articles/{filename}")
                blob.upload_from_string(pdf_file.read(), content_type='application/pdf')
                blob.make_public()
                public_url = blob.public_url
                
                new_article = Article(
                    title_uz=title_uz, title_en=title_en, title_ru=title_ru,
                    abstract_uz=abstract_uz, abstract_en=abstract_en, abstract_ru=abstract_ru,
                    keywords_uz=keywords_uz, keywords_en=keywords_en, keywords_ru=keywords_ru,
                    doi=doi, pdf_filename=public_url
                )
                db.session.add(new_article)
                db.session.commit()
                
                if authors_input:
                    author_names = authors_input.split(',')
                    for idx, name in enumerate(author_names):
                        new_author = Author(full_name=name.strip(), order_index=idx+1, article_id=new_article.id)
                        db.session.add(new_author)
                    db.session.commit()
                
                flash("Maqola muvaffaqiyatli qo'shildi!", "success")
                return redirect(url_for('add_article'))
            except Exception as e:
                flash(f"Xatolik yuz berdi: {str(e)}", "danger")
                return redirect(url_for('add_article'))
                
    return render_template('admin_add.html')

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
