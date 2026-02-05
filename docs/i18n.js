const translations = {
    en: {
        title: "OpenClaw App Idea Lab",
        tagline: "The Evolutionary Engine for AI-Native Tools",
        heroTitle: "Struggling to find the next killer app? Running out of creative sparks?",
        heroSubtitle: "We turn the sparks scattered across the digital landscape into reality you can touch. Stop wondering 'what if'—let Idea Lab autonomously scout global trends and hand you a ready-to-run prototype.",
        githubButton: "Start Evolving on GitHub",
        demoTitle: "See it in action",
        scenariosTitle: "Who is this for?",
        scenario1Title: "Automated Opportunity Scouting",
        scenario1Desc: "Stop guessing what people want. Our engine autonomously mines the web to identify pain points across industries, transforming hidden market gaps into verifiable prototypes instantly.",
        scenario2Title: "Bespoke Tools for Real Pain",
        scenario2Desc: "Not every problem needs a complex SaaS. We build nimble, context-aware modules for specific workflows, making productivity feel effortless again.",
        scenario3Title: "Your 24/7 Co-Founder",
        scenario3Desc: "While your system is idle, your AI partner is scanning the horizon for opportunities. Wake up to a dashboard full of fresh, verifiable inspiration.",
        footerText: "© 2026 HDDevTeam. Built for the future of productivity."
    },
    zh: {
        title: "OpenClaw App Idea Lab",
        tagline: "AI 原生工具的进化引擎",
        heroTitle: "让 AI 帮你发现下一个“Killer App”",
        heroSubtitle: "不再等待灵感被动降临。让 Idea Lab 深入互联网的角落，为你捕捉那些尚未被解决的商机。",
        githubButton: "在 GitHub 上开启进化",
        demoTitle: "观看演示",
        scenariosTitle: "这能为你带来什么？",
        scenario1Title: "自动化全网商机挖掘",
        scenario1Desc: "不再依赖个人灵感。系统会自动利用搜索引擎扫描全球动态，精准捕捉各行各业被忽视的痛点与商机，并即刻将其转化为可验证的原型，助你精准切入市场。",
        scenario2Title: "量身定制的私人工具箱",
        scenario2Desc: "不是每个问题都需要沉重的软件。我们为你构思那些解决特定痛点的小而美的工具，让 AI 深度理解你的上下文，让效率回归本质。",
        scenario3Title: "你的 24 小时 AI 合伙人",
        scenario3Desc: "当你休息时，它在不断扫描全球趋势并为你物色下一个商机。醒来时，你的“积压库”里可能已经躺着几个甚至连你自己都没想到的惊喜。",
        footerText: "© 2026 HDDevTeam. 为未来的生产力而筑。"
    }
};

function getLanguage() {
    const saved = localStorage.getItem('language');
    if (saved) return saved;
    const lang = navigator.language || navigator.userLanguage;
    return lang.startsWith('zh') ? 'zh' : 'en';
}

function setLanguage(lang) {
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    updateContent(lang);
}

function updateContent(lang) {
    const t = translations[lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.textContent = t[key];
        }
    });
    
    // Update language toggle visibility
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const lang = getLanguage();
    setLanguage(lang);

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setLanguage(e.target.getAttribute('data-lang'));
        });
    });
});
