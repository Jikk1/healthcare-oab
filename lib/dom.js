/* ============================================================
   HealthCareOAB+ — DOM helpers
   ============================================================ */

/**
 * Применяет динамические стили из атрибутов data-sty через CSSOM.
 *
 * Зачем: CSP без `style-src 'unsafe-inline'` запрещает литеральный атрибут
 * `style="…"` (в т.ч. внутри innerHTML), но НЕ запрещает присвоение свойства
 * `element.style` из JS. Поэтому динамику (цвет риска, ширину бара, позицию
 * маркера) кладём в `data-sty="prop:value;prop:value"`, а здесь переносим её
 * на CSSOM. Значения — это вычисленные числа/цвета/`var(--…)`, не пользовательский
 * ввод, поэтому в data-атрибуте они безопасны (текст всё равно идёт через escapeHtml).
 *
 * Вызывать после каждого `innerHTML = …`, где есть элементы с data-sty.
 *
 * @param {ParentNode|null} root  контейнер (или элемент), внутри которого искать
 */
export function applyDynamicStyles(root) {
  if (!root) return;
  // root сам может нести data-sty (когда это отдельный созданный элемент).
  if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-sty')) applyOne(root);
  const targets = root.querySelectorAll ? root.querySelectorAll('[data-sty]') : [];
  for (const el of targets) applyOne(el);
}

function applyOne(el) {
  const decls = el.getAttribute('data-sty');
  if (!decls) return;
  for (const decl of decls.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (prop) el.style.setProperty(prop, val);
  }
}

/**
 * Разово применяет data-sty ко всему, что уже в DOM, и вешает MutationObserver,
 * который делает то же для любого нового содержимого (innerHTML-рендеры таблиц,
 * карточек и т.п.). Колбэк наблюдателя — микротаска и выполняется ДО отрисовки,
 * поэтому мигания стилей нет. Достаточно вызвать один раз при инициализации.
 *
 * @param {ParentNode} [root=document.body]  корень наблюдения
 * @returns {MutationObserver}
 */
export function observeDynamicStyles(root = document.body) {
  if (!root) return null;
  applyDynamicStyles(root);
  const obs = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node.nodeType === 1) applyDynamicStyles(node);
      }
    }
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}
