"use strict";

const I18N = {
  en: {
    "search.placeholder": "Filter classes…",
    "btn.open": "📂 Open…",
    "mode.graph": "Graph",
    "mode.folder": "Folder",
    "legend.constructor": "constructor",
    "legend.field": "field",
    "btn.relayout": "Re-layout",
    "btn.reanalyze": "Re-analyze",
    "btn.tasks": "Tasks",
    "tasks.title": "Tasks",
    "tasks.close": "Close",
    "tasks.hint":
      "In Folder mode, drag a behavior onto another class → a task is created. Then run <code>/visualise tasks</code> in your terminal for Claude to process it.",
    "tasks.empty": "No tasks yet.",
    "task.approve": "Approve",
    "task.reject": "Reject",
    "task.chat": "Message Claude about this task…",
    "task.add": "new behavior",
    "task.in": "in",
    "commit.title": "Suggested commit message",
    "commit.copy": "Copy",
    "commit.copied": "Copied",
    "vscode.open": "Open in VS Code",
    "addbeh.btn": "Add behavior",
    "addbeh.title": "Add behavior",
    "addbeh.name": "method name (optional)",
    "addbeh.desc": "What behavior do you need on this class? (natural language)",
    "addbeh.sig": "signature (optional) — e.g. (limit: number): Order[]",
    "addbeh.create": "Create task",
    "addbeh.error": "Description is required.",
    "addbeh.errLabel": "On not-found / failure",
    "addbeh.errThrow": "Throw exception (recommended)",
    "addbeh.errNullable": "Return null / undefined",
    "addbeh.errDefault": "Default (repo convention)",
    "addbeh.exception": "Exception name — e.g. OrderNotFoundException",
    "task.onFailure": "on failure",
    "modal.cancel": "Cancel",
    "open.title": "Open repository",
    "open.path": "/absolute/path/to/repo or ~/path",
    "open.recent": "Recent",
    "open.confirm": "Open",
    "open.error": "Could not open: {error}",
    "empty.graph": "No graph yet. Open a repository.",
    "status.pending": "pending",
    "status.proposed": "needs review",
    "status.approved": "approved",
    "status.applied": "applied",
    "status.error": "error",
    "status.rejected": "rejected",
    "toast.opening": "Opening…",
    "toast.opened": "Opened {name}",
    "toast.reanalyzing": "Re-analyzing repository…",
    "toast.reanalyzed": "Re-analyzed.",
    "toast.reanalyzeFailed": "Re-analyze failed.",
    "toast.taskMove": "Task: move {behavior}() {from} → {to}",
    "toast.taskAdd": "Task: add behavior to {class}",
  },
  tr: {
    "search.placeholder": "Class filtrele…",
    "btn.open": "📂 Aç…",
    "mode.graph": "Grafik",
    "mode.folder": "Klasör",
    "legend.constructor": "constructor",
    "legend.field": "field",
    "btn.relayout": "Yeniden diz",
    "btn.reanalyze": "Yeniden analiz",
    "btn.tasks": "Görevler",
    "tasks.title": "Görevler",
    "tasks.close": "Kapat",
    "tasks.hint":
      "Klasör modunda bir davranışı başka bir class'a sürükle → görev oluşur. Sonra terminalde <code>/visualise tasks</code> ile Claude işler.",
    "tasks.empty": "Henüz görev yok.",
    "task.approve": "Onayla",
    "task.reject": "Reddet",
    "task.chat": "Bu görev hakkında Claude'a yaz…",
    "task.add": "yeni davranış",
    "task.in": "→",
    "commit.title": "Önerilen commit mesajı",
    "commit.copy": "Kopyala",
    "commit.copied": "Kopyalandı",
    "vscode.open": "VS Code'da aç",
    "addbeh.btn": "Davranış ekle",
    "addbeh.title": "Davranış ekle",
    "addbeh.name": "method adı (opsiyonel)",
    "addbeh.desc": "Bu class'a nasıl bir davranış istiyorsun? (doğal dil)",
    "addbeh.sig": "imza (opsiyonel) — örn. (limit: number): Order[]",
    "addbeh.create": "Görev oluştur",
    "addbeh.error": "Açıklama gerekli.",
    "addbeh.errLabel": "Bulunamazsa / hata olursa",
    "addbeh.errThrow": "Exception fırlat (önerilen)",
    "addbeh.errNullable": "null / undefined dön",
    "addbeh.errDefault": "Varsayılan (repo convention'ı)",
    "addbeh.exception": "Exception adı — örn. OrderNotFoundException",
    "task.onFailure": "hata durumunda",
    "modal.cancel": "İptal",
    "open.title": "Repository aç",
    "open.path": "/mutlak/yol/repo veya ~/yol",
    "open.recent": "Son kullanılan",
    "open.confirm": "Aç",
    "open.error": "Açılamadı: {error}",
    "empty.graph": "Henüz grafik yok. Bir repository aç.",
    "status.pending": "beklemede",
    "status.proposed": "inceleme bekliyor",
    "status.approved": "onaylandı",
    "status.applied": "uygulandı",
    "status.error": "hata",
    "status.rejected": "reddedildi",
    "toast.opening": "Açılıyor…",
    "toast.opened": "{name} açıldı",
    "toast.reanalyzing": "Repository yeniden analiz ediliyor…",
    "toast.reanalyzed": "Yeniden analiz edildi.",
    "toast.reanalyzeFailed": "Yeniden analiz başarısız.",
    "toast.taskMove": "Görev: {behavior}() taşı {from} → {to}",
    "toast.taskAdd": "Görev: {class} class'ına davranış ekle",
  },
};

const LANG_KEY = "repoVisualiserLang";
let currentLang = localStorage.getItem(LANG_KEY) || "en";

function t(key, vars) {
  const table = I18N[currentLang] || I18N.en;
  let value = table[key] != null ? table[key] : I18N.en[key] != null ? I18N.en[key] : key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, "g"), vars[name]);
    }
  }
  return value;
}

function applyI18n() {
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.innerHTML = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyI18n();
  if (typeof window.onLangChange === "function") window.onLangChange();
}
