export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const formData = await request.formData();
        const title = formData.get('title');
        const file = formData.get('file');

        if (!title || !file) {
            return new Response(JSON.stringify({ success: false, error: "Maqola nomi yoki fayl kiritilmadi!" }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Fayl nomini xavfsiz formatga keltirish
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${Date.now()}-${safeName}`;

        // 1. R2 omboriga yuklash
        if (env.R2_OMBOR) {
            const arrayBuffer = await file.arrayBuffer();
            await env.R2_OMBOR.put(fileName, arrayBuffer, {
                httpMetadata: { contentType: file.type || 'application/pdf' }
            });
        } else {
            throw new Error("R2 ombori (R2_OMBOR) Cloudflare'da ulanmagan!");
        }

        // 2. GitHub'dagi 'articles.json' faylini yangilash
        const repo = env.GITHUB_REPO; // Masalan: Muhammadyusuf95/scientific-article
        const token = env.GITHUB_TOKEN;

        if (!repo || !token) {
            throw new Error("GitHub sozlamalari (GITHUB_REPO yoki GITHUB_TOKEN) topilmadi!");
        }

        const githubUrl = `https://api.github.com/repos/${repo}/contents/articles.json`;

        const getRes = await fetch(githubUrl, {
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'User-Agent': 'Cloudflare-Pages-Function',
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let articles = [];
        let sha = "";

        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            const content = decodeURIComponent(escape(atob(data.content)));
            articles = JSON.parse(content);
        }

        // Yangi maqolani ro'yxatga qo'shish (ID ni avtomatik yaratish)
        const newId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
        
        articles.unshift({
            id: newId,
            title_uz: title,
            authors: ["Muallif ko'rsatilmagan"],
            year: new Date().getFullYear(),
            pdf: fileName,
            date: new Date().toISOString().split('T')[0]
        });

        // GitHub'ga yangilangan JSON ni yuborish
        const putRes = await fetch(githubUrl, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'User-Agent': 'Cloudflare-Pages-Function', 
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: `Yangi maqola qo'shildi: ${title}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(articles, null, 2)))),
                sha: sha || undefined
            })
        });

        if (!putRes.ok) {
            const errData = await putRes.text();
            throw new Error(`GitHub xatosi: ${errData}`);
        }

        return new Response(JSON.stringify({ success: true }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
