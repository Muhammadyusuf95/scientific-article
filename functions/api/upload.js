export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const file = formData.get('file');

        if (!title || !file) {
            return new Response(JSON.stringify({ success: false, error: "Fayl yoki nom kiritilmadi!" }), { status: 400 });
        }

        // Fayl nomini tozalash va vaqt qo'shish (bir xil nomli fayllar adashib ketmasligi uchun)
        const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;

        // 1. PDF faylni Cloudflare R2 omboriga yuklash
        if (env.R2_OMBOR) {
            await env.R2_OMBOR.put(fileName, await file.arrayBuffer(), {
                httpMetadata: { contentType: file.type }
            });
        } else {
            throw new Error("R2 ombori ulanmagan! Cloudflare sozlamalarini tekshiring.");
        }

        // 2. GitHub'dagi 'articles.json' fayliga maqola haqida ma'lumot qo'shish
        const githubUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
        
        const getRes = await fetch(githubUrl, {
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'User-Agent': 'Cloudflare-Pages' 
            }
        });
        
        let articles = [];
        let sha = "";
        
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            // Base64 dan matnga o'girish
            const content = decodeURIComponent(escape(atob(data.content)));
            articles = JSON.parse(content);
        }
        
        // Yangi maqolani ro'yxatga qo'shish
        articles.push({
            title: title,
            fileUrl: `/${fileName}`,
            date: new Date().toISOString()
        });

        // GitHub'dagi faylni yangilash
        const putRes = await fetch(githubUrl, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 
                'User-Agent': 'Cloudflare-Pages', 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                message: `Yangi maqola qo'shildi: ${title}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(articles, null, 2)))),
                sha: sha || undefined
            })
        });

        if (!putRes.ok) {
            throw new Error("GitHub'ga ma'lumot yozishda xatolik yuz berdi.");
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
}
