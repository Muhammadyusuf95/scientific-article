import os
import json
from flask import Flask, render_template, request, redirect, url_for, flash, session

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'super_maxfiy_kalit')

# Asosiy sahifa
@app.route('/')
def index():
    return """
    <html>
        <head><title>Ilmiy Maqolalar Portali</title></head>
        <body style="font-family: Arial; text-align: center; padding-top: 50px;">
            <h1>Ilmiy Maqolalar Portali</h1>
            <p>Cloudflare Workers serverida muvaffaqiyatli ishga tushdi!</p>
        </body>
    </html>
    """

# Cloudflare Workers uchun zarur bo'lgan ASGI kirish nuqtasi
async def on_fetch(request, env, ctx):
    return await app.handle_asgi(request, env)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
