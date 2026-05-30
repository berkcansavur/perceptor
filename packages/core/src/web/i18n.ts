type Dictionary = Record<string, string>;
type LangId = "en" | "tr";

const I18N: Record<LangId, Dictionary> = {
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
    "tasks.waiting": "{n} task(s) waiting for Claude — run /visualise tasks",
    "tasks.copyCmd": "Copy command",
    "tasks.copied": "Copied",
    "task.awaiting": "awaiting Claude",
    "task.processing": "processing",
    "auto.label": "Auto-process (uses Claude tokens)",
    "auto.unavailableDocker":
      "⚠ Auto-process is host-only — Docker can't run your Claude. Run via the CLI or VS Code extension.",
    "auto.unavailable": "⚠ Auto-process unavailable — Claude CLI not found on this host.",
    "task.dismiss": "Dismiss",
    "task.approve": "Approve",
    "task.reject": "Reject",
    "task.chat": "Message Claude about this task…",
    "task.add": "new behavior",
    "task.in": "in",
    "commit.title": "Suggested commit message",
    "commit.copy": "Copy",
    "commit.copied": "Copied",
    "impact.title": "Impact",
    "impact.ask": "Ask in chat for details.",
    "risk.low": "low risk",
    "risk.medium": "medium risk",
    "risk.high": "high risk",
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
    "edit.title": "Edit behavior",
    "edit.desc": "How should this behavior change? (natural language)",
    "edit.sig": "new signature (optional)",
    "edit.btn": "Edit",
    "create.file": "New file",
    "create.folder": "New folder",
    "create.fileBtn": "Add file",
    "create.folderBtn": "Add folder",
    "create.name": "name (e.g. ReportService.ts)",
    "create.folderName": "folder name",
    "create.desc": "what should it contain? (optional)",
    "create.in": "in",
    "create.dirLabel": "Parent directory (created if missing)",
    "create.dir": "e.g. src/controller — empty = repo root",
    "create.typeLabel": "File type",
    "create.typeName": "type name (e.g. ReportController)",
    "create.typeClass": "Class",
    "create.typeInterface": "Interface",
    "create.typeEnum": "Enum",
    "create.typeBarrel": "Barrel (index — re-exports)",
    "create.typeEmpty": "Empty file",
    "create.failed": "Could not create. Check the name/path.",
    "create.create": "Create",
    "tpl.class": "Class",
    "tpl.abstract-class": "Abstract class",
    "tpl.interface": "Interface",
    "tpl.enum": "Enum",
    "tpl.type": "Type alias",
    "tpl.record": "Record",
    "tpl.barrel": "Barrel (index — re-exports)",
    "tpl.empty": "Empty",
    "tpl.compose": "Docker Compose",
    "tpl.node": "Dockerfile (Node)",
    "tpl.function": "Function",
    "tpl.struct": "Struct",
    "tpl.trait": "Trait",
    "tpl.protocol": "Protocol",
    "tpl.object": "Object",
    "tpl.module": "Module",
    "tpl.doc": "HTML document",
    "tpl.sfc": "Component (SFC)",
    "tpl.script": "Script",
    "task.cancel": "Cancel task",
    "task.edit": "edit",
    "modal.cancel": "Cancel",
    "open.title": "Open repository",
    "open.path": "/absolute/path/to/repo or ~/path",
    "open.recent": "Recent",
    "open.browse": "Browse",
    "open.openThis": "Open this folder",
    "open.empty": "No subfolders",
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
    "toast.created": "Created {name}",
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
    "tasks.waiting": "{n} görev Claude'u bekliyor — terminalde /visualise tasks çalıştır",
    "tasks.copyCmd": "Komutu kopyala",
    "tasks.copied": "Kopyalandı",
    "task.awaiting": "Claude bekleniyor",
    "task.processing": "işleniyor",
    "auto.label": "Otomatik işle (Claude token harcar)",
    "auto.unavailableDocker":
      "⚠ Otomatik işleme sadece host'ta — Docker senin Claude'unu çalıştıramaz. CLI veya VS Code extension ile çalıştır.",
    "auto.unavailable": "⚠ Otomatik işleme yok — bu host'ta Claude CLI bulunamadı.",
    "task.dismiss": "Gizle",
    "task.approve": "Onayla",
    "task.reject": "Reddet",
    "task.chat": "Bu görev hakkında Claude'a yaz…",
    "task.add": "yeni davranış",
    "task.in": "→",
    "commit.title": "Önerilen commit mesajı",
    "commit.copy": "Kopyala",
    "commit.copied": "Kopyalandı",
    "impact.title": "Etki",
    "impact.ask": "Detay için chat'ten sor.",
    "risk.low": "düşük risk",
    "risk.medium": "orta risk",
    "risk.high": "yüksek risk",
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
    "edit.title": "Davranışı düzenle",
    "edit.desc": "Bu davranış nasıl değişsin? (doğal dil)",
    "edit.sig": "yeni imza (opsiyonel)",
    "edit.btn": "Düzenle",
    "create.file": "Yeni dosya",
    "create.folder": "Yeni klasör",
    "create.fileBtn": "Dosya ekle",
    "create.folderBtn": "Klasör ekle",
    "create.name": "ad (örn. ReportService.ts)",
    "create.folderName": "klasör adı",
    "create.desc": "içinde ne olmalı? (opsiyonel)",
    "create.in": "→",
    "create.dirLabel": "Üst klasör (yoksa oluşturulur)",
    "create.dir": "örn. src/controller — boş = repo kökü",
    "create.typeLabel": "Dosya türü",
    "create.typeName": "tür adı (örn. ReportController)",
    "create.typeClass": "Class",
    "create.typeInterface": "Interface",
    "create.typeEnum": "Enum",
    "create.typeBarrel": "Barrel (index — re-export)",
    "create.typeEmpty": "Boş dosya",
    "create.failed": "Oluşturulamadı. Ad/yolu kontrol et.",
    "create.create": "Oluştur",
    "tpl.class": "Class",
    "tpl.abstract-class": "Abstract class",
    "tpl.interface": "Interface",
    "tpl.enum": "Enum",
    "tpl.type": "Type alias",
    "tpl.record": "Record",
    "tpl.barrel": "Barrel (index — re-export)",
    "tpl.empty": "Boş",
    "tpl.compose": "Docker Compose",
    "tpl.node": "Dockerfile (Node)",
    "tpl.function": "Fonksiyon",
    "tpl.struct": "Struct",
    "tpl.trait": "Trait",
    "tpl.protocol": "Protocol",
    "tpl.object": "Object",
    "tpl.module": "Module",
    "tpl.doc": "HTML dökümanı",
    "tpl.sfc": "Bileşen (SFC)",
    "tpl.script": "Script",
    "task.cancel": "Görevi iptal et",
    "task.edit": "düzenle",
    "modal.cancel": "İptal",
    "open.title": "Repository aç",
    "open.path": "/mutlak/yol/repo veya ~/yol",
    "open.recent": "Son kullanılan",
    "open.browse": "Gözat",
    "open.openThis": "Bu klasörü aç",
    "open.empty": "Alt klasör yok",
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
    "toast.created": "{name} oluşturuldu",
  },
};

const LANG_KEY = "repoVisualiserLang";
let currentLang: LangId = I18N[localStorage.getItem(LANG_KEY) as LangId] ? (localStorage.getItem(LANG_KEY) as LangId) : "en";
let langChangeHandler: (() => void) | null = null;

export type TVars = Record<string, string | number>;

export function t(key: string, vars?: TVars): string {
  const table = I18N[currentLang] ?? I18N.en;
  let value = table[key] ?? I18N.en[key] ?? key;
  if (vars) {
    for (const name of Object.keys(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(vars[name]));
    }
  }
  return value;
}

export function getCurrentLang(): LangId {
  return currentLang;
}

export function applyI18n(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset["i18n"];
    if (key) {
      element.innerHTML = t(key);
    }
  }
  for (const element of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    const key = element.dataset["i18nPlaceholder"];
    if (key) {
      element.placeholder = t(key);
    }
  }
}

export function onLangChange(handler: () => void): void {
  langChangeHandler = handler;
}

export function setLang(lang: string): void {
  currentLang = lang === "tr" ? "tr" : "en";
  localStorage.setItem(LANG_KEY, currentLang);
  applyI18n();
  if (langChangeHandler) {
    langChangeHandler();
  }
}
