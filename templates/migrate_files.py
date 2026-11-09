import os
import boto3
import requests
from flask import Flask
from models import db, Article
import firebase_admin
from firebase_admin import credentials, storage

app = Flask(__name__)

# Ma'lumotlar bazasi sozlamalari
db_url = os.getenv('DATABASE_URL', 'sqlite:///scholar_db.sqlite')
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Cloudflare R2 sozlamalari
R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL', 'https://b828117b95ed9d61c82ed59a87d6290e.r2.cloudflarestorage.com')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', 'ac38a96c402e0c4e919cdd96554cfa6b')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', 'b2185c0d690c92f0d2ef49cde3b182be3b83be1fff97059b99ab0d221ab606')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'scientific-article')
R2_PUBLIC_URL = "https://pub-21eece65689f4ee39fbe5b16812adb10.r2.dev"

s3_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Firebase ni ishga tushirish (agar firebase_key.json hali mavjud bo'lsa)
FIREBASE_BUCKET = 'scientific-article-22107.firebasestorage.app'
FIREBASE_KEY_PATH = 'firebase_key.json'

if os.path.exists(FIREBASE_KEY_PATH) and not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_KEY_PATH)
    firebase_admin.initialize_app(cred, {'storageBucket': FIREBASE_BUCKET})

def migrate_articles():
    with app.app_context():
        articles = Article.query.all()
        print(f"Jami topilgan maqolalar soni: {len(articles)}")
        
        for article in articles:
            old_url = article.pdf_filename
            
            # Agar havola allaqachon R2 ga o'tgan bo'lsa, o'tkazib yuboramiz
            if "r2.dev" in old_url:
                print(f"O'tkazib yuborildi (allaqachon R2 da): ID {article.id}")
                continue
                
            try:
                # Fayl nomini eski havoladan ajratib olish
                filename = old_url.split('/')[-1].split('?')[0]
                if not filename:
                    continue
                
                print(f"Ko'chirilmoqda: {filename} (Maqola ID: {article.id})")
                
                file_bytes = None
                
                # 1-usul: Firebase SDK orqali yuklab olishga urinish
                if firebase_admin._apps:
                    try:
                        bucket = storage.bucket()
                        blob = bucket.blob(f"articles/{filename}")
                        if blob.exists():
                            file_bytes = blob.download_as_bytes()
                    except Exception as e:
                        print(f"Firebase SDK orqali olishda xatolik: {e}")
                
                # 2-usul: Agar SDK o'xshamasa, to'g'ridan-to'g'ri eski public URL orqali yuklab olish
                if not file_bytes:
                    response = requests.get(old_url)
                    if response.status_code == 200:
                        file_bytes = response.content
                
                if file_bytes:
                    # Cloudflare R2 ga yuklash
                    s3_client.put_object(
                        Bucket=R2_BUCKET_NAME,
                        Key=filename,
                        Body=file_bytes,
                        ContentType='application/pdf'
                    )
                    
                    # Bazadagi havolani yangi R2 manziliga o'zgartirish
                    article.pdf_filename = f"{R2_PUBLIC_URL}/{filename}"
                    db.session.commit()
                    print(f"Muvaffaqiyatli ko'chirildi va baza yangilandi: ID {article.id}")
                else:
                    print(f"Faylni topib bo'lmadi: {filename}")
                    
            except Exception as e:
                print(f"Xatolik yuz berdi (Maqola ID {article.id}): {e}")
                
        print("Barcha amallar yakunlandi!")

if __name__ == '__main__':
    migrate_articles()
