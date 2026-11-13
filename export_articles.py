# export_articles.py
import json
from app import app
from models import Article, Collection

FIELDS = [
    "id", "item_type", "title_uz", "title_en", "title_ru",
    "abstract_uz", "abstract_en", "abstract_ru",
    "keywords_uz", "keywords_en", "keywords_ru",
    "isbn", "issn", "bbk", "udk", "journal_name", "conference_org",
    "references", "year", "volume", "issue", "pages", "doi",
    "pdf_filename", "publisher", "institution",
    "pub_date", "uploaded_date", "collection_id",
]

with app.app_context():
    collections = [
        {"id": c.id, "name": c.name}
        for c in Collection.query.order_by(Collection.id).all()
    ]
    articles = []
    for a in Article.query.order_by(Article.year.desc(), Article.id.desc()).all():
        item = {f: getattr(a, f) for f in FIELDS}
        item["authors"] = [
            x.full_name
            for x in sorted(a.authors, key=lambda x: x.order_index or 1)
        ]
        articles.append(item)

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump({"collections": collections, "articles": articles},
                  f, ensure_ascii=False, indent=2)

    print(f"Tayyor: {len(articles)} ta maqola, {len(collections)} ta to'plam")
