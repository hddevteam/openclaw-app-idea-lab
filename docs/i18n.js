const translations = {
    en: {
        title: "OpenClaw App Idea Lab",
        tagline: "The Evolutionary Engine for AI-Native Tools",
        heroTitle: "Struggling to find the next killer app? Running out of creative sparks for OpenClaw?",
        heroSubtitle: "Stop staring at a blank prompt. Idea Lab autonomously transforms digital trends into high-fidelity, interactive prototypes—instantly.",
        githubButton: "Start Evolving on GitHub",
        demoTitle: "See it in action",
        scenariosTitle: "Turning Friction into Function",
        scenario1Title: "From Insight to Impact",
        scenario1Desc: "From mining inspiration and capturing opportunities to generating verifiable prototypes. Powered by HDDevTeam.",
        scenario2Title: "Workflow Augmentation",
        scenario2Desc: "Automate the ideation of context-aware tools for complex business processes, from CRM extensions to IoT dashboards.",
        scenario3Title: "The 24/7 Idea Factory",
        scenario3Desc: "Leverage the OpenClaw agent ecosystem to continuously scan trends and generate bespoke solutions during system idle time.",
        footerText: "© 2026 HDDevTeam. Built for the future of productivity."
    },
    zh: {
        title: "OpenClaw App Idea Lab",
        tagline: "AI 原生工具的进化引擎",
        heroTitle: "不知道用 OpenClaw 做什么？已经才思枯竭？",
        heroSubtitle: "别再对着空白提示词发呆。Idea Lab 能够全自动地捕捉数字化趋势，将其瞬间转化为高保真、可交互的实体原型。",
        githubButton: "在 GitHub 上开启进化",
        demoTitle: "观看演示",
        scenariosTitle: "将痛点转化为生产力",
        scenario1Title: "从灵感到演示",
        scenario1Desc: "从挖掘灵感、捕捉商机到生成可验证原型。由 HDDevTeam 倾力打造。",
        scenario2Title: "工作流深度增强",
        scenario2Desc: "为复杂的业务流程自动化构思上下文感知工具，从 CRM 增强插件到物联网交互面板。",
        scenario3Title: "24/7 不间断灵感工厂",
        scenario3Desc: "利用 OpenClaw 智能体生态系统持续扫描全球趋势，并在系统空闲时自动提炼并生成定制化解决方案。",
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
