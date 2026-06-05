## Вывод

Сейчас продукт уже работает как beta, но UX ещё выглядит как developer tool. Главные правки перед публичным релизом:

1. **Скрыть debug-информацию** (`Duplicates skipped`, длинные first/last previews, tab ids).
2. **Сделать понятный Filename Builder вместо `{tokens}` руками.**
3. **Починить Batch Export UX:** не скачивать ZIP, если все вкладки упали; заранее объяснять host/tabs permissions.
4. **Сделать clean HTML/PDF export:** сейчас HTML местами содержит внутренний ChatGPT DOM/class names, это плохо для экспортёра.
5. **Починить Perplexity adapter или убрать Perplexity из claims до фикса.**
6. **Заменить `LA` на реальный логотип в popup/preview/options.**
7. **Сделать Preview page нормально центрированной.**
8. **Чётко объяснить `Include metadata` и `Redact common secrets`.**

---

# 1. Что можно улучшить

## P0/P1 перед публичным релизом

| Приоритет | Улучшение                         | Почему                                                                                                                                                                                                                    |
| --------: | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    **P1** | **Clean HTML/PDF rendering**      | В экспортированном HTML сейчас видны внутренние ChatGPT wrapper/classes вроде `flex w-full...`, `data-testid`, `markdown prose...`; экспорт должен быть semantic HTML, а не dump DOM. В загруженном HTML это явно видно.  |
|    **P1** | **Batch export preflight**        | Если все выбранные вкладки недоступны, ZIP скачивать не надо. Сейчас batch ZIP может содержать только `manifest.json` с ошибками. Это создаёт ложное ощущение успеха.                                                     |
|    **P1** | **Perplexity adapter**            | На скрине Perplexity страница содержит ответ, но extension пишет `No messages were found on this page`. Значит adapter detection/extraction не работает.                                                                  |
|    **P1** | **Host permission для batch**     | Batch пытается экспортировать неактивные вкладки `chatgpt.com`, но без host permission получает injection failure. Нужно заранее запросить доступ к host или не начинать экспорт.                                         |
|    **P2** | **Filename Builder**              | Пользователь не должен знать `{datetime}`, `{platform}`, `{title}`, `{format}`. Сейчас это просто raw input. В QA/скринах видно поле `Filename template` с ручными шаблонами.                                             |
|    **P2** | **Preview centering**             | Отдельный preview сейчас прижат влево. Для browser page нужно центрирование контейнера.                                                                                                                                   |
|    **P2** | **Metadata/redaction tooltips**   | Сейчас чекбоксы есть, но непонятно, что именно они меняют.                                                                                                                                                                |
|    **P2** | **Убрать debug из default UI**    | `Duplicates skipped` — не пользовательская метрика.                                                                                                                                                                       |
|    **P3** | **Правильные plurals**            | `48 message(s)` выглядит как dev placeholder. Нужно `48 messages`, `1 message`.                                                                                                                                           |
|    **P3** | **Сократить first/last previews** | Сейчас они ломают layout и визуально перегружают popup.                                                                                                                                                                   |

---

# 2. Почему вообще я должен видеть `Duplicates skipped`?

Не должен видеть по умолчанию.

`Duplicates skipped` — это **внутренняя диагностическая метрика сканера**. Она показывает, сколько повторно встреченных DOM-сообщений scanner отбросил при auto-scroll/virtualized rendering. В JSON export видно, что scanner хранит `duplicateCount`, например `2752`, вместе с `scrollSteps`, `firstMessagePreview`, `lastMessagePreview`. 

Почему число большое: ChatGPT переиспользует/перерендеривает DOM во время scroll; scanner много раз видит одни и те же сообщения и дедуплицирует их.

Лучшее поведение:

```text
Completeness: Complete
Messages: 48
Advanced details ▾
  Scroll steps: 124
  Duplicates skipped: 2752
  Reached top: yes
  Reached bottom: yes
```

В default UI оставить только:

```text
48 messages captured
Complete
```

---

# 3. Filename template должен быть не raw string, а builder

Сейчас поле требует знания скрытых переменных. Это неправильно. Должен быть **token/chip builder**.

## Как должно выглядеть

```text
Filename

[Date/time] _ [Platform] _ [Title] . [Format]

Preview:
2026-06-03T17-40-47Z_chatgpt_Local-AI-Chat-Exporter.md
```

Ниже кнопки-вставки:

```text
+ Date
+ Time
+ Date/time
+ Platform
+ Title
+ Conversation ID
+ Format
+ Custom text
```

Пользователь может:

* перетаскивать блоки;
* удалять блоки;
* писать текст между ними;
* видеть live preview;
* нажать `Reset to default`.

## Технически

Сохранять можно всё равно как строку:

```text
{datetime}_{platform}_{title}.{format}
```

Но UI должен быть tokenized editor.

Доступные поля:

| Token              | Значение                                    |
| ------------------ | ------------------------------------------- |
| `{datetime}`       | ISO-like timestamp без запрещённых символов |
| `{date}`           | YYYY-MM-DD                                  |
| `{time}`           | HH-MM-SS                                    |
| `{platform}`       | `chatgpt`, `claude`, etc.                   |
| `{title}`          | sanitized conversation title                |
| `{conversationId}` | ID чата, если найден                        |
| `{format}`         | `md`, `json`, `html`, etc.                  |

---

# 4. First/Last слишком длинные

Да. Сейчас они занимают половину popup.

Лучшее:

```text
First: “Ранее я видел, что в интерфейсе ChatGPT было изменение…”
Last: “Скопируй Codex целиком. Read AGENTS.md…”
```

С ограничением:

```css
-webkit-line-clamp: 2;
overflow: hidden;
```

И кнопка:

```text
Show details
```

Внутри details можно показать полную first/last preview и debug info.

---

# 5. Зачем в ZIP просто все типы файлов?

Сейчас поведение неочевидное. Есть два разных сценария, которые смешаны:

## Сценарий A — “Export ZIP bundle”

Пользователь выбирает **ZIP**, и внутри лежит набор файлов:

```text
manifest.json
conversation.md
conversation.json
conversation.html
```

Это нормально, если объяснено.

## Сценарий B — “Export all selected formats”

Пользователь выбирает:

```text
MD + JSON + HTML + DOCX + ZIP
```

Тогда непонятно: надо скачать отдельные файлы плюс ZIP? Или ZIP должен содержать выбранные форматы?

Лучше разделить:

```text
Output mode:
○ Separate files
○ ZIP bundle

Formats inside:
☑ Markdown
☑ JSON
☑ HTML
☐ DOCX
☐ TXT
☐ CSV
☐ Print HTML
```

Текущий single-export ZIP действительно содержит несколько форматов и `manifest.json`; в загруженном ZIP manifest перечисляет `md`, `json`, `html`, `docx`, `txt`, `csv`, `pdf.html`. Это не баг само по себе, но UI должен явно объяснять содержимое bundle.

---

# 6. За что отвечают `Include metadata` и `Redact common secrets`

## Include metadata

Должно означать:

```text
Добавить служебные данные об экспорте и источнике.
```

Включает:

| Поле                 | Пример                 |
| -------------------- | ---------------------- |
| platform             | `ChatGPT`              |
| source_url           | URL чата               |
| title                | название чата          |
| conversation_id      | ID разговора           |
| exported_at          | timestamp экспорта     |
| message_count        | число сообщений        |
| completeness         | статус полноты         |
| warnings             | предупреждения scanner |
| role/model/createdAt | если доступны          |

В Markdown это сейчас выглядит как YAML frontmatter и строки `Source`, `Exported`, `Completeness`. Загруженный `.md` показывает именно такие поля. 

Лучшее UI-описание:

```text
Include metadata
Adds source URL, export time, platform, conversation ID, message count and completeness info.
Turn off for a cleaner transcript.
```

Если выключено, должно быть:

```text
# Title

## 1. User
...
```

без `source_url`, `conversation_id`, `exported_at`.

## Redact common secrets

Должно означать:

```text
Перед сохранением заменить похожие на секреты строки.
```

Что редактировать:

| Тип                          | Пример                              |
| ---------------------------- | ----------------------------------- |
| emails                       | `name@example.com`                  |
| bearer tokens                | `Bearer ...`                        |
| API keys                     | `sk-...`, `token-...`, `key-...`    |
| long hex/base64-like secrets | длинные хэши/токены                 |
| phone-like strings           | осторожно, чтобы не портить даты/ID |

Лучше заменить checkbox на preset:

```text
Redaction:
○ Off
○ Basic: emails + phone-like strings
○ Strict: emails + phones + API keys + long tokens
○ Custom regex...
```

Сейчас один чекбокс `Redact common secrets` слишком грубый. Он может редактировать не только настоящие секреты, но и SHA/hash-like строки.

---

# 7. `Scanned 48 message(s)` — надо исправить

Да. Сделать helper:

```ts
function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
```

Тогда:

```text
Scanned 1 message. Ready to export.
Scanned 48 messages. Ready to export.
Exported 1 message to 1 file.
Exported 48 messages to 2 files.
```

И убрать `file(s)` тоже.

---

# 8. Batch Export показывает слишком много служебной информации

Да. Сейчас слишком много:

```text
Batch export lists only AI chat tabs already open...
chatgpt.com/c/... - tab 147910958
```

В QA-сниппетах видно, что Batch Export показывает длинное объяснение про tabs permission и затем title + URL + tab id. 

Лучше:

```text
Batch export
Export already-open AI chat tabs.

[Find tabs]
```

После клика:

```text
3 tabs found

☑ ChatGPT — Подписка на Gemini или Claude
   chatgpt.com

☑ ChatGPT — DNA Analysis
   chatgpt.com / Project

Advanced details ▾
  tab id: 147910958
  full URL: ...
```

Permission copy:

```text
Needs “tabs” permission to list open AI chat tabs. Content is processed locally.
```

Не показывать tab id по умолчанию.

---

# 9. Почему preview не центрируется

Причина почти точно CSS/layout:

```css
.app-shell--preview {
  width: min(1120px, 100vw);
  min-height: 100vh;
  align-content: start;
  padding: 24px;
}
```

Нет:

```css
margin-inline: auto;
```

И iframe/header занимают свою ширину слева.

Нужно:

```css
.app-shell--preview {
  width: min(1120px, calc(100vw - 48px));
  margin-inline: auto;
  padding: 24px;
}

.preview-page-header,
.preview-frame,
.status-text {
  width: min(100%, 960px);
  margin-inline: auto;
}

.preview-frame {
  display: block;
  min-height: calc(100vh - 170px);
}
```

Плюс можно сделать верхнюю панель sticky:

```css
.preview-page-header {
  position: sticky;
  top: 12px;
  z-index: 10;
}
```

---

# 10. Privacy link не работает

Сейчас footer ведёт на якорь внутри popup:

```text
chrome-extension://.../popup/index.html#privacy
```

В QA-сниппете footer содержит `[Privacy](chrome-extension://.../popup/index.html#privacy)`. 

Это почти бесполезно: пользователь уже в popup, а `#privacy` ведёт на короткую строку “100% local processing...”.

Лучше сделать отдельную страницу:

```text
extension/privacy/index.html
```

или использовать options page:

```text
chrome.runtime.getURL("options/index.html#privacy")
```

В footer:

```text
Privacy
```

должен открывать нормальную страницу с:

* что обрабатывается;
* что не отправляется;
* какие permissions;
* что хранится в `chrome.storage`;
* что не хранится;
* как проверить source code;
* ссылка на GitHub PRIVACY.md.

---

# 11. Batch failed ZIP скачивать не надо

Да. Если batch export полностью failed, ZIP скачивать не нужно.

Правильная логика:

| Ситуация            | Поведение                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0 success, N failed | Не скачивать ZIP. Показать ошибку и список причин.                                                         |
| M success, N failed | Скачать ZIP только с успешными exports + `manifest.json` с warnings. Показать “Exported M tabs, N failed.” |
| N success, 0 failed | Скачать ZIP, показать success.                                                                             |

Сейчас твой failed batch ZIP содержал только `manifest.json` с ошибками injection/permission. Это не полезный export.

Также ошибка говорит:

```text
Extension manifest must request permission to access this host.
```

Для batch неактивных вкладок `activeTab` уже недостаточен. Нужно явно запросить host permission:

```text
Request access to chatgpt.com for batch export?
```

---

# 12. Куда ещё вставить логотип

Да, логотип стоит использовать шире. Сейчас в popup header всё ещё текстовый квадрат `LA`. Это выглядит как placeholder.

Где использовать:

| Место                        | Как                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Popup header                 | заменить `LA` на `icon-32.png` или `icon-48.png`                                    |
| Options page header          | тот же icon                                                                         |
| Preview page header          | маленький icon + title                                                              |
| Empty preview state          | watermark/icon 48px                                                                 |
| Exported HTML/PDF            | опционально, маленький logo в footer/header, только если `Include branding` включён |
| README                       | 128/256px                                                                           |
| Chrome Web Store screenshots | 128/512px                                                                           |
| GitHub social preview        | отдельный banner с logo                                                             |

Я бы **не вставлял большой логотип в сам экспорт по умолчанию**, потому что это пользовательский архив, а не маркетинговый документ. Но в preview/options/popup — да.

---

# 13. Perplexity не работает

Да, это отдельный баг.

Вероятные причины:

1. adapter selectors устарели;
2. Perplexity DOM не содержит ожидаемых `data-testid`;
3. расширение определяет страницу как supported, но extraction возвращает 0 сообщений;
4. host permission не запрошен/не активирован;
5. Perplexity answer/search tabs отличаются от обычного conversation layout.

Что делать:

```text
Perplexity support = experimental, hidden behind “Experimental platforms”
```

Пока не исправлено, не писать в Store Listing “supports Perplexity”.

Нужно добавить:

* live DOM fixture из Perplexity страницы;
* detection test;
* extraction test минимум для user query + answer;
* fallback extraction: `main article`, `[data-testid]`, `prose`, `answer`, `thread`;
* clear error: `Perplexity layout not recognized. Exporter needs an adapter update.`

---

# Дополнительные улучшения, которые я бы добавил

## A. Убрать сырой ChatGPT HTML из HTML/PDF exports

Это сейчас самый неприятный архитектурный момент. HTML export должен строиться из clean model:

```text
ConversationExport.messages[].markdown/text/codeBlocks/tables/images
```

а не вставлять:

```html
<div class="flex w-full flex-col gap-1 empty:hidden ...">
```

Загруженный HTML показывает внутренние классы/DOM ChatGPT. 

Нужно:

```text
Default HTML = clean semantic HTML
Debug HTML = optional, hidden
JSON rawHtml = off by default
```

## B. Переименовать PDF

Сейчас `PDF` фактически создаёт `pdf.html`, то есть print-ready HTML. В загруженном ZIP это видно как файл:

```text
2026-06-03T17-40-47Z_chatgpt_Local-AI-Chat-Exporter.pdf.html
```

Значит UI должен быть честнее:

```text
Print HTML
```

или:

```text
PDF-ready HTML
```

Не называй это полноценным PDF, пока не создаётся настоящий `.pdf`.

## C. Export options после scan

До scan можно скрыть часть export options:

```text
Export options
Available after scan
```

или оставить collapsed. Сейчас popup сразу очень длинный.

## D. Advanced mode

Ввести переключатель:

```text
Mode: Simple / Advanced
```

Simple:

```text
Scan
Download Markdown
Copy Markdown
Full preview
```

Advanced:

```text
formats, scope, templates, metadata, redaction, batch, debug
```

## E. Scope UX

`Custom range` со stepper и индексами 0/1 выглядит опасно. Пользователь мыслит 1-based.

Лучше:

```text
Range:
From message [1] to [48]
```

С валидацией:

```text
Start must be between 1 and 48.
End must be >= start.
```

---

# Приоритетная задача для Codex

```text
Read AGENTS.md, docs/SECURITY_PRIVACY_REQUIREMENTS.md, extension/manifest.json, src/ui, src/core, src/renderers, extension/background/batch.ts, extension/content/request-handler.ts, and current tests.

Fix UX/product issues found during Brave manual QA. Do not add telemetry, analytics, remote code, server calls, broad permissions, or unrelated features.

Scope:

1. Hide scanner debug info by default
- Remove “Duplicates skipped” from default Completeness UI.
- Add collapsed “Advanced scan details” with duplicateCount, scrollSteps, reachedTop, reachedBottom.
- Truncate first/last previews to 2 lines or 100 chars, with “Show full preview details”.

2. Improve count wording
- Replace message(s)/file(s) with proper pluralization:
  1 message / N messages
  1 file / N files
- Apply to scan, export, batch, preview status messages.

3. Replace raw Filename template input with token builder
- Default pattern: {datetime}_{platform}_{title}.{format}
- Provide token chips:
  Date, Time, Date/time, Platform, Title, Conversation ID, Format
- Allow custom text separators between tokens.
- Allow drag/reorder/remove tokens.
- Show live filename preview.
- Keep underlying stored template string for compatibility.
- Add help text listing available tokens.

4. Explain metadata/redaction
- Add tooltips or info text:
  Include metadata = source URL, title, conversation ID, exported time, message count, completeness, warnings.
  Redact common secrets = emails, phone-like strings, API keys, bearer tokens, long secret-like values.
- Replace redaction checkbox with preset selector:
  Off / Basic / Strict / Custom
- Keep strict as equivalent of old checked behavior.

5. Fix ZIP semantics
- Replace ZIP checkbox with Output mode:
  Separate files / ZIP bundle
- For ZIP bundle, let user choose formats inside bundle.
- If current architecture keeps ZIP as a format, clearly label it “ZIP bundle” and show “Includes: MD, JSON, HTML” or selected formats.
- Do not create a failed-only ZIP.

6. Fix Batch Export UX
- Collapse permission explanation.
- Show tab title + host only by default.
- Hide tab id and full URL under details.
- Before batch export, preflight selected tabs:
  if host permission is missing, ask clearly for host permission.
- If all selected tabs fail, do not download ZIP.
- If some fail, download ZIP with successful exports and show “M exported, N failed.”
- Add tests for all-failed batch = no ZIP download.

7. Fix preview page centering
- Center .app-shell--preview and preview iframe/header.
- Add max-width and margin-inline:auto.
- Keep toolbar readable and optionally sticky.
- Verify preview is centered in Brave at normal desktop width.

8. Fix Privacy link
- Replace popup #privacy footer link with a real privacy page or options/index.html#privacy.
- Open it in a tab using chrome.runtime.getURL.
- Add a proper privacy section explaining local processing, permissions, storage, and no telemetry.

9. Use real logo
- Replace “LA” brand mark in popup/options/preview with generated extension icon PNG/SVG-safe img.
- Keep accessible alt text or aria-hidden as appropriate.
- Do not use external assets.

10. Clean HTML/PDF exports
- Default HTML/PDF exports must be semantic clean HTML, not raw ChatGPT DOM/class dumps.
- Do not include ChatGPT internal class names, data-testid, Tailwind class noise, citation UI wrappers, or hidden controls.
- Use markdown/text/codeBlocks/tables/images from the normalized model.
- JSON default should omit raw HTML or put it behind debugRawHtml=false.
- Add regression tests that HTML export does not contain “data-testid”, “markdown prose”, “flex w-full”, “user-message-bubble-color”, or ChatGPT internal classes.

11. Perplexity support
- Treat Perplexity as experimental until it works.
- Fix Perplexity detection/extraction for current page layout.
- Add fixtures/tests from a representative Perplexity answer page.
- If extraction finds 0 messages, show a precise adapter error rather than generic “No messages were found”.
- Do not claim Perplexity support in README/store docs unless tests pass.

12. Custom range UX
- Make range 1-based in UI.
- Validate start/end.
- Show “From 1 to N”.
- Prevent 0 or invalid ranges.

Tests:
- Unit tests for pluralization, filename token builder, metadata/redaction labels, ZIP mode, batch all-failed behavior, clean HTML renderer, preview centering CSS guard where practical, Perplexity fixture extraction.
- E2E/static tests for popup no overflow, preview URL/centering, privacy link target, no raw ChatGPT DOM in exported HTML.

Run:
pnpm install --frozen-lockfile
pnpm icons:build
pnpm icons:check
pnpm palette:check
pnpm check
pnpm test:e2e
pnpm package
node scripts/check-no-remote-code.mjs
node scripts/check-manifest-permissions.mjs
node scripts/check-content-script-classic.mjs
node scripts/check-preview-build.mjs --release

Manual Brave QA:
- Scan ChatGPT chat.
- Verify default UI is simpler.
- Verify advanced details show duplicates only when expanded.
- Verify filename builder works.
- Verify privacy link opens.
- Verify preview is centered.
- Verify batch all-failed does not download ZIP.
- Verify Perplexity either works or shows precise experimental adapter error.
- Verify exported HTML contains no raw ChatGPT internal DOM/classes.
```

---

## Мой продуктовый вердикт

Сейчас лучше позиционировать как:

```text
Private local ChatGPT exporter — beta
```

Не как:

```text
AI chat exporter for ChatGPT, Claude, Gemini, Perplexity...
```

Пока Perplexity и batch не доведены, сильнейший путь — сделать **ChatGPT export безупречным**, затем добавлять платформы по одной.
