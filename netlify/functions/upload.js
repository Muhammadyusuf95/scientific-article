const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

exports.handler = async (event) => {
  // Faqat POST so'rovlarni qabul qilish
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Ruxsat etilmagan metod" };

  try {
    const data = JSON.parse(event.body);
    const { pdfBase64, pdfName, articleData } = data;

    // 1. PDF FAYLNI CLOUDFLARE R2 GA YUKLASH
    if (pdfBase64 && pdfName) {
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });

      // Base64 dan buferga o'tkazish
      const buffer = Buffer.from(pdfBase64.split(",")[1], "base64");
      
      await s3.send(new PutObjectCommand({
        Bucket: "scientific-article", // Cloudflare'dagi omboringiz nomi
        Key: pdfName,
        Body: buffer,
        ContentType: "application/pdf"
      }));
    }

    // 2. ARTICLES.JSON NI GITHUB'DA YANGILASH
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const githubUrl = `https://api.github.com/repos/${repo}/contents/articles.json`;

    // Eski faylni yuklab olish (SHA kodini olish uchun)
    const getRes = await fetch(githubUrl, {
      headers: { Authorization: `token ${token}`, "User-Agent": "Netlify-Function" }
    });
    const getJson = await getRes.json();
    
    // Faylni o'qish va yangi maqolani qo'shish
    const content = Buffer.from(getJson.content, 'base64').toString('utf8');
    const articlesData = JSON.parse(content);
    articlesData.articles.push(articleData);

    // Yangilangan ma'lumotni Base64 ga o'tkazib GitHub'ga saqlash
    const newContentBase64 = Buffer.from(JSON.stringify(articlesData, null, 2)).toString('base64');
    const putRes = await fetch(githubUrl, {
      method: "PUT",
      headers: { Authorization: `token ${token}`, "User-Agent": "Netlify-Function", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Saytdan yangi maqola qo'shildi: ${articleData.id}`,
        content: newContentBase64,
        sha: getJson.sha
      })
    });

    if (!putRes.ok) throw new Error("GitHub'ga saqlashda xatolik yuz berdi");

    return { statusCode: 200, body: JSON.stringify({ success: true, message: "Muvaffaqiyatli yuklandi!" }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
  }
};
