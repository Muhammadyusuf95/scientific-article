import os
import time
from flask import Flask, request, render_template, redirect, url_for, flash, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, Article, Author, User, Collection
from sqlalchemy import text

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit_uchun_tasodifiy_satr')

# --- DATABASE SOZLAMASI ---
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"Baza xatosi: {e}")

# --- ASOSIY MARSHRUTLAR ---
@app.route('/')
def index():
    query = request.args.get('q', '')
    collections = Collection.query.order_by(Collection.created_at.desc()).all()
    
    if query:
        articles = Article.query.filter(
            (Article.title_uz.ilike(f'%{query}%')) | 
            (Article.title_en.ilike(f'%{query}%')) | 
            (Article.title_ru.ilike(f'%{query}%'))
        ).order_by(Article.year.desc()).all()
    else:
        articles = Article.query.order_by(Article.year.desc(), Article.created_at.desc()).all()
        
    return render_template('index.html', articles=articles, collections=collections, query=query)

@app.route('/article/<int:id>')
def article_detail(id):
    article = Article.query.get_or_404(id)
    try:
        article.views_count = (article.views_count or 0) + 1
        db.session.commit()
    except Exception:
        db.session.rollback()

    collection = article.collection if hasattr(article, 'collection') else None
    return render_template('article.html', article=article, collection=collection)

@app.route('/collection/<int:collection_id>')
def collection_detail(collection_id):
    collection = Collection.query.get_or_404(collection_id)
    articles = Article.query.filter_by(collection_id=collection.id).all()
    collections = Collection.query.all()
    return render_template('collection.html', collection=collection, articles=articles, collections=collections)

# --- AUTENTIFIKATSIYA VA ADMIN ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password, password):
            session['user_id'] = user.id
            session['username'] = user.username
            flash("Tizimga muvaffaqiyatli kirdingiz!", "success")
            return redirect(url_for('index'))
        else:
            flash("Login yoki parol noto'g'ri!", "danger")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash("Tizimdan chiqildi.", "info")
    return redirect(url_for('index'))

# --- STATIK SAHIFALAR ---
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

# --- CLOUDFLARE WORKERS / ASGI KIRISH QISMI ---
async def on_fetch(request, env, ctx):
    return await app.handle_asgi(request, env)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
