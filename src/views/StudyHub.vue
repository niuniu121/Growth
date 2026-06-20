<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

const STORAGE_KEY = "growthos-study-workspace-v2";
const LEGACY_STORAGE_KEY = "growthos-study-notes";
const AI_ENDPOINT = import.meta.env.VITE_STUDY_AI_ENDPOINT || "";

const workspaceTitle = ref("Study Hub");
const nodes = ref([]);
const selectedId = ref(null);
const searchQuery = ref("");
const renamingId = ref(null);
const renameDraft = ref("");
const openMenuId = ref(null);
const draggedId = ref(null);
const rightPanelOpen = ref(true);
const sidebarCollapsed = ref(false);
const editorRef = ref(null);
const imageInputRef = ref(null);
const hydrated = ref(false);
const savedState = ref("Saved");
const toast = ref("");

const assistantQuestion = ref("");
const assistantResponse = ref("");
const assistantLoading = ref(false);

const noteTypes = ["Note", "Course", "Resource", "Question", "Project"];
const statusOptions = ["Inbox", "Learning", "Review", "Completed"];

let saveTimer = null;
let toastTimer = null;

const currentNode = computed(
  () => nodes.value.find((node) => node.id === selectedId.value) || null,
);

const currentFolderId = computed(() => {
  if (!currentNode.value) return null;
  return currentNode.value.type === "folder"
    ? currentNode.value.id
    : currentNode.value.parentId;
});

const allNotes = computed(() =>
  nodes.value.filter((node) => node.type === "note"),
);

const allFolders = computed(() =>
  nodes.value.filter((node) => node.type === "folder"),
);

const currentChildren = computed(() =>
  sortNodes(
    nodes.value.filter(
      (node) => node.parentId === (currentNode.value?.id || null),
    ),
  ),
);

const breadcrumbs = computed(() => {
  const result = [];
  let cursor = currentNode.value;

  while (cursor) {
    result.unshift(cursor);
    cursor = nodes.value.find((node) => node.id === cursor.parentId) || null;
  }

  return result;
});

const visibleTree = computed(() => {
  const result = [];
  const query = searchQuery.value.trim().toLowerCase();
  const includeIds = new Set();

  if (query) {
    nodes.value.forEach((node) => {
      const haystack = [
        node.title,
        stripHtmlText(node.content || ""),
        node.category,
        ...(node.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      if (haystack.includes(query)) {
        includeIds.add(node.id);

        let parentId = node.parentId;
        while (parentId) {
          includeIds.add(parentId);
          parentId = nodes.value.find((item) => item.id === parentId)?.parentId;
        }
      }
    });
  }

  function walk(parentId, depth) {
    sortNodes(nodes.value.filter((node) => node.parentId === parentId)).forEach(
      (node) => {
        if (query && !includeIds.has(node.id)) return;

        result.push({ node, depth });

        if (node.type === "folder" && (query || !node.collapsed)) {
          walk(node.id, depth + 1);
        }
      },
    );
  }

  walk(null, 0);
  return result;
});

const searchResultCount = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return 0;

  return nodes.value.filter((node) => {
    const haystack = [
      node.title,
      stripHtmlText(node.content || ""),
      node.category,
      ...(node.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  }).length;
});

const currentWordCount = computed(() => {
  const content = stripHtmlText(currentNode.value?.content || "").trim();
  if (!content) return 0;
  return content.split(/\s+/).filter(Boolean).length;
});

const currentCharacterCount = computed(
  () => stripHtmlText(currentNode.value?.content || "").length,
);

const folderNoteCount = computed(() => {
  if (!currentNode.value || currentNode.value.type !== "folder") return 0;
  return collectDescendantIds(currentNode.value.id).filter(
    (id) => nodes.value.find((node) => node.id === id)?.type === "note",
  ).length;
});

onMounted(() => {
  loadWorkspace();
  document.addEventListener("click", closeMenus);
  window.addEventListener("keydown", handleKeyboardShortcut);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeMenus);
  window.removeEventListener("keydown", handleKeyboardShortcut);
  window.clearTimeout(saveTimer);
  window.clearTimeout(toastTimer);
});

watch(
  [workspaceTitle, nodes, selectedId, sidebarCollapsed],
  () => {
    if (!hydrated.value) return;

    savedState.value = "Saving…";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistWorkspace();
      savedState.value = "Saved";
    }, 220);
  },
  { deep: true },
);

watch(selectedId, () => {
  assistantQuestion.value = "";
  assistantResponse.value = "";
  openMenuId.value = null;
  nextTick(syncEditorContent);
});

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function createBaseNode(type, parentId, title) {
  const now = new Date().toISOString();

  return {
    id: newId(),
    type,
    parentId,
    title,
    content: "",
    collapsed: false,
    favorite: false,
    noteType: type === "note" ? "Note" : "Folder",
    status: type === "note" ? "Inbox" : "",
    category: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function loadWorkspace() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored);
      workspaceTitle.value = parsed.workspaceTitle || "Study Hub";
      nodes.value = Array.isArray(parsed.nodes)
        ? parsed.nodes.map(normaliseNode)
        : [];
      selectedId.value = nodes.value.some(
        (node) => node.id === parsed.selectedId,
      )
        ? parsed.selectedId
        : null;
      sidebarCollapsed.value = Boolean(parsed.sidebarCollapsed);
    } else {
      migrateLegacyNotes();
    }
  } catch (error) {
    console.error("Failed to load Study Hub:", error);
    nodes.value = [];
    selectedId.value = null;
  } finally {
    hydrated.value = true;
  }
}

function normaliseNode(node) {
  return {
    id: node.id || newId(),
    type: node.type === "folder" ? "folder" : "note",
    parentId: node.parentId || null,
    title: node.title || node.topic || "Untitled",
    content: node.content || node.html || "",
    collapsed: Boolean(node.collapsed),
    favorite: Boolean(node.favorite),
    noteType: node.noteType || (node.type === "folder" ? "Folder" : "Note"),
    status: node.status || (node.type === "folder" ? "" : "Inbox"),
    category: node.category || "",
    tags: Array.isArray(node.tags) ? node.tags : [],
    createdAt: node.createdAt || new Date().toISOString(),
    updatedAt: node.updatedAt || node.createdAt || new Date().toISOString(),
  };
}

function migrateLegacyNotes() {
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;

  try {
    const legacyNotes = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyNotes) || !legacyNotes.length) return;

    const importedFolder = createBaseNode("folder", null, "Imported Notes");
    const importedNotes = legacyNotes.map((note) => ({
      ...createBaseNode("note", importedFolder.id, note.topic || "Untitled"),
      content: note.content || "",
      category: note.category || "",
      status: note.level === "Mastered" ? "Completed" : "Learning",
      tags: note.level ? [note.level] : [],
      createdAt: note.createdAt || new Date().toISOString(),
      updatedAt: note.createdAt || new Date().toISOString(),
    }));

    nodes.value = [importedFolder, ...importedNotes];
    selectedId.value = importedNotes[0]?.id || importedFolder.id;
    showToast("Previous learning notes were imported");
  } catch (error) {
    console.error("Failed to import previous notes:", error);
  }
}

function persistWorkspace() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        workspaceTitle: workspaceTitle.value,
        nodes: nodes.value,
        selectedId: selectedId.value,
        sidebarCollapsed: sidebarCollapsed.value,
      }),
    );
  } catch (error) {
    console.error("Failed to save Study Hub:", error);
    savedState.value = "Save failed";
  }
}

function sortNodes(items) {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function selectRoot() {
  selectedId.value = null;
}

function selectNode(id) {
  selectedId.value = id;
}

function createFolder(parentId = currentFolderId.value) {
  const folder = createBaseNode("folder", parentId || null, "Untitled folder");
  nodes.value.push(folder);
  selectedId.value = folder.id;
  ensureParentExpanded(parentId);
  beginRename(folder.id);
}

function createNote(parentId = currentFolderId.value) {
  const note = createBaseNode("note", parentId || null, "Untitled");
  nodes.value.push(note);
  selectedId.value = note.id;
  ensureParentExpanded(parentId);
  beginRename(note.id);
}

function ensureParentExpanded(parentId) {
  if (!parentId) return;
  const parent = nodes.value.find((node) => node.id === parentId);
  if (parent?.type === "folder") parent.collapsed = false;
}

function beginRename(id) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return;

  renamingId.value = id;
  renameDraft.value = node.title;
  openMenuId.value = null;

  nextTick(() => {
    const input = document.querySelector(`[data-rename-id="${id}"]`);
    input?.focus();
    input?.select();
  });
}

function commitRename(id) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return;

  const nextTitle = renameDraft.value.trim();
  if (nextTitle) {
    node.title = nextTitle;
    touchNode(node);
  }

  renamingId.value = null;
  renameDraft.value = "";
}

function cancelRename() {
  renamingId.value = null;
  renameDraft.value = "";
}

function updateTitle(event) {
  if (!currentNode.value) return;
  currentNode.value.title = event.target.value;
  touchNode(currentNode.value);
}

function updateContent(event) {
  if (!currentNode.value) return;
  currentNode.value.content = event.target.value;
  touchNode(currentNode.value);
}

function updateRichContent() {
  if (
    !currentNode.value ||
    currentNode.value.type !== "note" ||
    !editorRef.value
  )
    return;
  currentNode.value.content = cleanEditorHtml(editorRef.value.innerHTML);
  touchNode(currentNode.value);
}

function syncEditorContent() {
  if (
    !editorRef.value ||
    !currentNode.value ||
    currentNode.value.type !== "note"
  )
    return;
  editorRef.value.innerHTML = currentNode.value.content || "";
}

function stripHtmlText(html = "") {
  if (!html) return "";

  if (typeof document === "undefined") {
    return String(html)
      .replace(/<img[^>]*>/gi, " image ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const div = document.createElement("div");
  div.innerHTML = String(html).replace(/<img[^>]*>/gi, " image ");
  return (div.innerText || div.textContent || "").replace(/\s+/g, " ").trim();
}

function cleanEditorHtml(html = "") {
  if (typeof document === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content
    .querySelectorAll("script, style, iframe, object, embed")
    .forEach((element) => element.remove());

  template.content.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) || attribute.name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return template.innerHTML;
}

function openImagePicker() {
  imageInputRef.value?.click();
}

async function handleImagePick(event) {
  const files = Array.from(event.target.files || []).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (!files.length) return;

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    insertImageAtCursor(dataUrl, file.name || "Inserted image");
  }

  event.target.value = "";
  updateRichContent();
  showToast(
    files.length === 1 ? "Image added" : `${files.length} images added`,
  );
}

async function handleEditorPaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItems = items.filter((item) => item.type.startsWith("image/"));

  if (!imageItems.length) return;

  event.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    const dataUrl = await fileToDataUrl(file);
    insertImageAtCursor(dataUrl, file.name || "Pasted image");
  }

  updateRichContent();
  showToast(
    imageItems.length === 1
      ? "Image pasted"
      : `${imageItems.length} images pasted`,
  );
}

async function handleEditorDrop(event) {
  const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (!files.length) return;

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    insertImageAtCursor(dataUrl, file.name || "Dropped image");
  }

  updateRichContent();
  showToast(
    files.length === 1 ? "Image added" : `${files.length} images added`,
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function insertImageAtCursor(src, alt = "Study image") {
  if (!editorRef.value) return;

  editorRef.value.focus();

  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if (!range || !editorRef.value.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(editorRef.value);
    range.collapse(false);
  }

  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.className = "note-image";

  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createElement("br"));

  const fragment = document.createDocumentFragment();
  fragment.appendChild(image);
  fragment.appendChild(paragraph);

  range.deleteContents();
  range.insertNode(fragment);

  range.setStartAfter(paragraph);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function updateField(field, value) {
  if (!currentNode.value) return;
  currentNode.value[field] = value;
  touchNode(currentNode.value);
}

function updateTags(event) {
  const tags = event.target.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);

  updateField("tags", [...new Set(tags)]);
}

function touchNode(node) {
  node.updatedAt = new Date().toISOString();
}

function toggleCollapse(id) {
  const folder = nodes.value.find((node) => node.id === id);
  if (!folder || folder.type !== "folder") return;
  folder.collapsed = !folder.collapsed;
}

function toggleFavorite(id) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return;
  node.favorite = !node.favorite;
  touchNode(node);
  showToast(node.favorite ? "Added to favourites" : "Removed from favourites");
}

function duplicateNote(id) {
  const source = nodes.value.find(
    (node) => node.id === id && node.type === "note",
  );
  if (!source) return;

  const copy = {
    ...source,
    id: newId(),
    title: `${source.title} copy`,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  nodes.value.push(copy);
  selectedId.value = copy.id;
  showToast("Note duplicated");
}

function collectDescendantIds(parentId) {
  const result = [];
  const directChildren = nodes.value.filter(
    (node) => node.parentId === parentId,
  );

  directChildren.forEach((child) => {
    result.push(child.id);
    if (child.type === "folder") {
      result.push(...collectDescendantIds(child.id));
    }
  });

  return result;
}

function deleteNode(id) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return;

  const descendantIds = collectDescendantIds(id);
  const total = descendantIds.length + 1;
  const message =
    node.type === "folder" && total > 1
      ? `Delete “${node.title}” and its ${total - 1} nested item(s)?`
      : `Delete “${node.title}”?`;

  if (!window.confirm(message)) return;

  const removedIds = new Set([id, ...descendantIds]);
  const fallbackParent = node.parentId || null;
  nodes.value = nodes.value.filter((item) => !removedIds.has(item.id));

  if (selectedId.value && removedIds.has(selectedId.value)) {
    selectedId.value = fallbackParent;
  }

  openMenuId.value = null;
  showToast("Deleted");
}

function moveToRoot(id) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return;
  node.parentId = null;
  touchNode(node);
  showToast("Moved to Study Hub");
}

function openNodeMenu(id, event) {
  event.stopPropagation();
  openMenuId.value = openMenuId.value === id ? null : id;
}

function closeMenus() {
  openMenuId.value = null;
}

function handleKeyboardShortcut(event) {
  const modifier = event.metaKey || event.ctrlKey;

  if (event.key === "Escape") {
    closeMenus();
    cancelRename();
    return;
  }

  if (!modifier) return;

  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    persistWorkspace();
    savedState.value = "Saved";
    showToast("Saved");
  }

  if (event.key.toLowerCase() === "n" && event.shiftKey) {
    event.preventDefault();
    createFolder();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    createNote();
  }
}

function onDragStart(id, event) {
  draggedId.value = id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
}

function onDragEnd() {
  draggedId.value = null;
}

function dropOnFolder(folderId, event) {
  event.stopPropagation();
  const id = draggedId.value || event.dataTransfer.getData("text/plain");
  moveNode(id, folderId);
}

function dropAtRoot(event) {
  const id = draggedId.value || event.dataTransfer.getData("text/plain");
  moveNode(id, null);
}

function moveNode(id, targetFolderId) {
  const node = nodes.value.find((item) => item.id === id);
  if (!node || id === targetFolderId) return;

  if (targetFolderId) {
    const target = nodes.value.find((item) => item.id === targetFolderId);
    if (!target || target.type !== "folder") return;

    if (node.type === "folder" && isDescendant(targetFolderId, node.id)) {
      showToast("A folder cannot be moved inside itself");
      return;
    }
  }

  node.parentId = targetFolderId || null;
  touchNode(node);
  ensureParentExpanded(targetFolderId);
  draggedId.value = null;
  showToast(targetFolderId ? "Moved into folder" : "Moved to Study Hub");
}

function isDescendant(candidateId, ancestorId) {
  let cursor = nodes.value.find((node) => node.id === candidateId);

  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true;
    cursor = nodes.value.find((node) => node.id === cursor.parentId);
  }

  return false;
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function relativeDate(dateString) {
  if (!dateString) return "";

  const timestamp = new Date(dateString).getTime();
  const difference = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(difference / 60000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateString));
}

function showToast(message) {
  toast.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = "";
  }, 1800);
}

function buildAssistantContext() {
  if (!currentNode.value || currentNode.value.type !== "note") return "";

  const siblingNotes = nodes.value
    .filter(
      (node) =>
        node.type === "note" &&
        node.parentId === currentNode.value.parentId &&
        node.id !== currentNode.value.id,
    )
    .slice(0, 4)
    .map((note) => `Title: ${note.title}\n${note.content.slice(0, 800)}`)
    .join("\n\n");

  return [
    `Current note: ${currentNode.value.title}`,
    stripHtmlText(currentNode.value.content),
    siblingNotes ? `Related notes:\n${siblingNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runAssistant(mode) {
  if (!currentNode.value || currentNode.value.type !== "note") return;

  if (!currentNode.value.content.trim()) {
    assistantResponse.value = "Write a little more before analysing this note.";
    return;
  }

  assistantLoading.value = true;
  assistantResponse.value = "";

  if (!AI_ENDPOINT) {
    assistantResponse.value = buildLocalReview();
    assistantLoading.value = false;
    return;
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        question: assistantQuestion.value.trim(),
        context: buildAssistantContext(),
        note: currentNode.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    assistantResponse.value =
      data.answer || data.response || "No response was returned.";
  } catch (error) {
    console.error(error);
    assistantResponse.value =
      "The study assistant could not connect. Your notes are still saved locally.";
  } finally {
    assistantLoading.value = false;
  }
}

function buildLocalReview() {
  const content = stripHtmlText(currentNode.value?.content || "").trim();
  const lines = content.split("\n").filter((line) => line.trim());
  const hasExample = /example|for example|例如|比如/i.test(content);
  const hasQuestion = /\?|？/.test(content);
  const suggestions = [];

  if (content.length < 250) {
    suggestions.push("Add one clear explanation in your own words.");
  }
  if (!hasExample) {
    suggestions.push("Add a concrete example or a small practice task.");
  }
  if (!hasQuestion) {
    suggestions.push("Write one question you still cannot answer confidently.");
  }
  if (lines.length < 3) {
    suggestions.push(
      "Break the note into short sections so it is easier to review.",
    );
  }
  if (!suggestions.length) {
    suggestions.push(
      "Turn this note into three recall questions for your next review.",
    );
  }

  return `Quick review\n\n${suggestions.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nConnect VITE_STUDY_AI_ENDPOINT when you are ready to use your own AI service.`;
}
</script>

<template>
  <section
    class="study-shell"
    :class="{ 'sidebar-collapsed': sidebarCollapsed }"
  >
    <aside
      class="sidebar"
      :class="{ collapsed: sidebarCollapsed }"
      @dragover.prevent
      @drop="dropAtRoot"
    >
      <div class="workspace-head">
        <button
          class="workspace-mark mark-button"
          type="button"
          :title="sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          S
        </button>
        <input
          v-model="workspaceTitle"
          class="workspace-name"
          aria-label="Workspace name"
        />
        <button
          class="icon-button"
          type="button"
          title="New note"
          @click.stop="createNote(null)"
        >
          +
        </button>
      </div>

      <div class="search-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
        </svg>
        <input v-model="searchQuery" placeholder="Search" />
        <button
          v-if="searchQuery"
          type="button"
          aria-label="Clear search"
          @click="searchQuery = ''"
        >
          ×
        </button>
      </div>

      <div class="quick-create">
        <button type="button" @click="createNote()">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h8l4 4v14H6V3Z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
          New note
        </button>
        <button type="button" @click="createFolder()">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h7l2 2h9v11H3V6Z" />
          </svg>
          New folder
        </button>
      </div>

      <div class="tree-label">
        <span>{{
          searchQuery ? `${searchResultCount} results` : "Library"
        }}</span>
        <span class="shortcut">⌘ N</span>
      </div>

      <nav class="tree" aria-label="Study folders and notes">
        <button
          class="tree-row root-row"
          :class="{ active: selectedId === null }"
          type="button"
          @click="selectRoot"
        >
          <span class="tree-spacer"></span>
          <svg class="tree-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4h16v16H4V4Z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
          <span class="tree-title">All notes</span>
        </button>

        <div
          v-for="entry in visibleTree"
          :key="entry.node.id"
          class="tree-entry"
          :class="{ dragging: draggedId === entry.node.id }"
          :style="{ '--tree-depth': entry.depth }"
          draggable="true"
          @dragstart="onDragStart(entry.node.id, $event)"
          @dragend="onDragEnd"
          @dragover="entry.node.type === 'folder' && $event.preventDefault()"
          @drop="
            entry.node.type === 'folder' && dropOnFolder(entry.node.id, $event)
          "
        >
          <div
            class="tree-row"
            :class="{ active: selectedId === entry.node.id }"
            role="button"
            tabindex="0"
            @click="selectNode(entry.node.id)"
            @keydown.enter.prevent="selectNode(entry.node.id)"
          >
            <button
              v-if="entry.node.type === 'folder'"
              class="collapse-button"
              type="button"
              :aria-label="
                entry.node.collapsed ? 'Expand folder' : 'Collapse folder'
              "
              @click.stop="toggleCollapse(entry.node.id)"
            >
              {{ entry.node.collapsed && !searchQuery ? "›" : "⌄" }}
            </button>
            <span v-else class="tree-spacer"></span>

            <svg
              v-if="entry.node.type === 'folder'"
              class="tree-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M3 6h7l2 2h9v11H3V6Z" />
            </svg>
            <svg
              v-else
              class="tree-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 3h8l4 4v14H6V3Z" />
              <path d="M14 3v5h5" />
            </svg>

            <input
              v-if="renamingId === entry.node.id"
              v-model="renameDraft"
              class="rename-input"
              :data-rename-id="entry.node.id"
              @click.stop
              @blur="commitRename(entry.node.id)"
              @keydown.enter.prevent="commitRename(entry.node.id)"
              @keydown.esc.prevent="cancelRename"
            />
            <span v-else class="tree-title">
              {{ entry.node.title || "Untitled" }}
            </span>

            <span v-if="entry.node.favorite" class="favourite-dot">★</span>

            <button
              class="row-menu-button"
              type="button"
              aria-label="More actions"
              @click="openNodeMenu(entry.node.id, $event)"
            >
              ···
            </button>
          </div>

          <div
            v-if="openMenuId === entry.node.id"
            class="context-menu"
            @click.stop
          >
            <button
              v-if="entry.node.type === 'folder'"
              type="button"
              @click="createNote(entry.node.id)"
            >
              New note inside
            </button>
            <button
              v-if="entry.node.type === 'folder'"
              type="button"
              @click="createFolder(entry.node.id)"
            >
              New folder inside
            </button>
            <button type="button" @click="beginRename(entry.node.id)">
              Rename
            </button>
            <button
              v-if="entry.node.type === 'note'"
              type="button"
              @click="duplicateNote(entry.node.id)"
            >
              Duplicate
            </button>
            <button type="button" @click="toggleFavorite(entry.node.id)">
              {{ entry.node.favorite ? "Remove favourite" : "Add favourite" }}
            </button>
            <button
              v-if="entry.node.parentId"
              type="button"
              @click="moveToRoot(entry.node.id)"
            >
              Move to top level
            </button>
            <div class="menu-divider"></div>
            <button
              class="danger-action"
              type="button"
              @click="deleteNode(entry.node.id)"
            >
              Delete
            </button>
          </div>
        </div>

        <div v-if="searchQuery && !searchResultCount" class="tree-empty">
          No matching notes
        </div>
      </nav>

      <div class="sidebar-footer">
        <span
          >{{ allNotes.length }} notes · {{ allFolders.length }} folders</span
        >
        <span>{{ savedState }}</span>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumbs">
          <button type="button" @click="selectRoot">
            {{ workspaceTitle }}
          </button>
          <template v-for="crumb in breadcrumbs" :key="crumb.id">
            <span>/</span>
            <button type="button" @click="selectNode(crumb.id)">
              {{ crumb.title || "Untitled" }}
            </button>
          </template>
        </div>

        <div class="topbar-actions">
          <button
            class="plain-button"
            type="button"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            {{ sidebarCollapsed ? "Show sidebar" : "Hide sidebar" }}
          </button>
          <span>{{ savedState }}</span>
          <button
            class="plain-button"
            type="button"
            @click="rightPanelOpen = !rightPanelOpen"
          >
            {{ rightPanelOpen ? "Hide details" : "Show details" }}
          </button>
        </div>
      </header>

      <section v-if="!currentNode" class="folder-page">
        <div class="page-width">
          <div class="page-kicker">PERSONAL KNOWLEDGE BASE</div>
          <h1>{{ workspaceTitle }}</h1>
          <p class="page-description">
            Keep courses, resources, questions and project notes in one quiet
            place.
          </p>

          <div class="page-actions">
            <button
              class="primary-action"
              type="button"
              @click="createNote(null)"
            >
              New note
            </button>
            <button
              class="secondary-action"
              type="button"
              @click="createFolder(null)"
            >
              New folder
            </button>
          </div>

          <div class="list-heading">
            <span>Name</span>
            <span>Type</span>
            <span>Updated</span>
          </div>

          <div v-if="!currentChildren.length" class="empty-page">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h7l2 2h9v11H3V6Z" />
            </svg>
            <h2>Start with a folder or note</h2>
            <p>
              You can drag items into folders and create folders inside folders.
            </p>
          </div>

          <template v-else>
            <button
              v-for="node in currentChildren"
              :key="node.id"
              class="content-row"
              type="button"
              @click="selectNode(node.id)"
            >
              <span class="content-name">
                <svg
                  v-if="node.type === 'folder'"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3 6h7l2 2h9v11H3V6Z" />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 3h8l4 4v14H6V3Z" />
                  <path d="M14 3v5h5" />
                </svg>
                <span>{{ node.title || "Untitled" }}</span>
              </span>
              <span>{{
                node.type === "folder" ? "Folder" : node.noteType
              }}</span>
              <span>{{ relativeDate(node.updatedAt) }}</span>
            </button>
          </template>
        </div>
      </section>

      <section v-else-if="currentNode.type === 'folder'" class="folder-page">
        <div class="page-width">
          <svg class="page-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h7l2 2h9v11H3V6Z" />
          </svg>
          <input
            class="page-title-input"
            :value="currentNode.title"
            placeholder="Untitled folder"
            @input="updateTitle"
          />
          <textarea
            class="folder-description"
            :value="currentNode.content"
            rows="2"
            placeholder="Add a description…"
            @input="updateContent"
          ></textarea>

          <div class="page-actions">
            <button
              class="primary-action"
              type="button"
              @click="createNote(currentNode.id)"
            >
              New note
            </button>
            <button
              class="secondary-action"
              type="button"
              @click="createFolder(currentNode.id)"
            >
              New subfolder
            </button>
          </div>

          <div class="list-heading">
            <span>Name</span>
            <span>Type</span>
            <span>Updated</span>
          </div>

          <div v-if="!currentChildren.length" class="empty-page compact">
            <h2>This folder is empty</h2>
            <p>Add a note or create another folder inside it.</p>
          </div>

          <template v-else>
            <button
              v-for="node in currentChildren"
              :key="node.id"
              class="content-row"
              type="button"
              @click="selectNode(node.id)"
            >
              <span class="content-name">
                <svg
                  v-if="node.type === 'folder'"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3 6h7l2 2h9v11H3V6Z" />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 3h8l4 4v14H6V3Z" />
                  <path d="M14 3v5h5" />
                </svg>
                <span>{{ node.title || "Untitled" }}</span>
              </span>
              <span>{{
                node.type === "folder" ? "Folder" : node.noteType
              }}</span>
              <span>{{ relativeDate(node.updatedAt) }}</span>
            </button>
          </template>
        </div>
      </section>

      <section v-else class="note-page">
        <div class="note-width">
          <div class="note-meta-line">
            <span>{{ currentNode.noteType }}</span>
            <span>·</span>
            <span>{{ relativeDate(currentNode.updatedAt) }}</span>
          </div>

          <div class="title-line">
            <input
              class="note-title-input"
              :value="currentNode.title"
              placeholder="Untitled"
              @input="updateTitle"
            />
            <button
              class="favourite-button"
              :class="{ active: currentNode.favorite }"
              type="button"
              :title="
                currentNode.favorite ? 'Remove favourite' : 'Add favourite'
              "
              @click="toggleFavorite(currentNode.id)"
            >
              ☆
            </button>
          </div>

          <div v-if="currentNode.tags?.length" class="inline-tags">
            <span v-for="tag in currentNode.tags" :key="tag">{{ tag }}</span>
          </div>

          <div class="editor-toolbar">
            <button type="button" @click="openImagePicker">Add image</button>
            <span>Paste screenshots or images directly into the note.</span>
            <input
              ref="imageInputRef"
              class="hidden-file-input"
              type="file"
              accept="image/*"
              multiple
              @change="handleImagePick"
            />
          </div>

          <div
            :key="currentNode.id"
            ref="editorRef"
            class="note-editor rich-editor"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            data-placeholder="Start writing…"
            @input="updateRichContent"
            @paste="handleEditorPaste"
            @dragover.prevent
            @drop.prevent="handleEditorDrop"
          ></div>

          <footer class="editor-footer">
            <span>{{ currentWordCount }} words</span>
            <span>{{ currentCharacterCount }} characters</span>
            <span>Saved locally</span>
          </footer>
        </div>
      </section>
    </main>

    <aside v-if="rightPanelOpen" class="inspector">
      <template v-if="!currentNode">
        <div class="inspector-head">
          <h2>Overview</h2>
        </div>

        <div class="stat-list">
          <div>
            <span>Notes</span>
            <strong>{{ allNotes.length }}</strong>
          </div>
          <div>
            <span>Folders</span>
            <strong>{{ allFolders.length }}</strong>
          </div>
          <div>
            <span>Favourites</span>
            <strong>{{ nodes.filter((node) => node.favorite).length }}</strong>
          </div>
        </div>

        <div class="inspector-section">
          <h3>Shortcuts</h3>
          <p><kbd>⌘ / Ctrl</kbd> + <kbd>N</kbd> New note</p>
          <p>
            <kbd>⌘ / Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> New folder
          </p>
          <p><kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> Save now</p>
        </div>
      </template>

      <template v-else-if="currentNode.type === 'folder'">
        <div class="inspector-head">
          <h2>Folder details</h2>
          <button type="button" @click="beginRename(currentNode.id)">
            Rename
          </button>
        </div>

        <div class="property-row">
          <span>Items</span>
          <strong>{{ currentChildren.length }}</strong>
        </div>
        <div class="property-row">
          <span>Nested notes</span>
          <strong>{{ folderNoteCount }}</strong>
        </div>
        <div class="property-row stacked">
          <span>Created</span>
          <small>{{ formatDate(currentNode.createdAt) }}</small>
        </div>
        <div class="property-row stacked">
          <span>Updated</span>
          <small>{{ formatDate(currentNode.updatedAt) }}</small>
        </div>

        <div class="inspector-section action-stack">
          <button type="button" @click="createNote(currentNode.id)">
            Add note inside
          </button>
          <button type="button" @click="createFolder(currentNode.id)">
            Add subfolder
          </button>
          <button
            v-if="currentNode.parentId"
            type="button"
            @click="moveToRoot(currentNode.id)"
          >
            Move to top level
          </button>
          <button
            class="danger-text"
            type="button"
            @click="deleteNode(currentNode.id)"
          >
            Delete folder
          </button>
        </div>
      </template>

      <template v-else>
        <div class="inspector-head">
          <h2>Details</h2>
          <button type="button" @click="beginRename(currentNode.id)">
            Rename
          </button>
        </div>

        <label class="property-field">
          <span>Type</span>
          <select
            :value="currentNode.noteType"
            @change="updateField('noteType', $event.target.value)"
          >
            <option v-for="type in noteTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </label>

        <label class="property-field">
          <span>Status</span>
          <select
            :value="currentNode.status"
            @change="updateField('status', $event.target.value)"
          >
            <option
              v-for="status in statusOptions"
              :key="status"
              :value="status"
            >
              {{ status }}
            </option>
          </select>
        </label>

        <label class="property-field">
          <span>Category</span>
          <input
            :value="currentNode.category"
            placeholder="e.g. Vue, Teaching"
            @input="updateField('category', $event.target.value)"
          />
        </label>

        <label class="property-field">
          <span>Tags</span>
          <input
            :value="currentNode.tags?.join(', ')"
            placeholder="Separate with commas"
            @change="updateTags"
          />
        </label>

        <label class="check-row">
          <input
            type="checkbox"
            :checked="currentNode.favorite"
            @change="toggleFavorite(currentNode.id)"
          />
          <span>Favourite</span>
        </label>

        <div class="inspector-section date-list">
          <p>
            <span>Created</span>
            <small>{{ formatDate(currentNode.createdAt) }}</small>
          </p>
          <p>
            <span>Updated</span>
            <small>{{ formatDate(currentNode.updatedAt) }}</small>
          </p>
        </div>

        <div class="inspector-section action-stack">
          <button type="button" @click="duplicateNote(currentNode.id)">
            Duplicate note
          </button>
          <button
            v-if="currentNode.parentId"
            type="button"
            @click="moveToRoot(currentNode.id)"
          >
            Move to top level
          </button>
          <button
            class="danger-text"
            type="button"
            @click="deleteNode(currentNode.id)"
          >
            Delete note
          </button>
        </div>

        <details class="assistant-box">
          <summary>
            <span>Study assistant</span>
            <span>›</span>
          </summary>

          <div class="assistant-content">
            <button
              class="assistant-action"
              type="button"
              :disabled="assistantLoading"
              @click="runAssistant('analyse')"
            >
              {{ assistantLoading ? "Analysing…" : "Review this note" }}
            </button>

            <textarea
              v-model="assistantQuestion"
              rows="3"
              placeholder="Ask about this note…"
            ></textarea>
            <button
              class="assistant-link"
              type="button"
              :disabled="assistantLoading || !assistantQuestion.trim()"
              @click="runAssistant('question')"
            >
              Ask
            </button>

            <pre v-if="assistantResponse">{{ assistantResponse }}</pre>
          </div>
        </details>
      </template>
    </aside>

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </section>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  color: inherit;
}

.study-shell {
  --sidebar-width: 270px;
  --inspector-width: 270px;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(
      --inspector-width
    );
  width: 100%;
  height: calc(100vh - 32px);
  min-height: 680px;
  overflow: hidden;
  border: 1px solid #e8e8e5;
  border-radius: 12px;
  background: #ffffff;
  color: #37352f;
  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.study-shell.sidebar-collapsed {
  --sidebar-width: 54px;
}

.sidebar,
.inspector {
  min-width: 0;
  background: #f7f7f5;
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e8e8e5;
}

.workspace-head {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 8px;
}

.workspace-mark {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: #37352f;
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.mark-button {
  cursor: pointer;
}

.mark-button:hover {
  background: #1f1e1b;
}

.sidebar.collapsed .workspace-head {
  grid-template-columns: 1fr;
  justify-items: center;
  padding: 12px 0;
}

.sidebar.collapsed .workspace-name,
.sidebar.collapsed .workspace-head .icon-button,
.sidebar.collapsed .search-wrap,
.sidebar.collapsed .quick-create,
.sidebar.collapsed .tree-label,
.sidebar.collapsed .tree,
.sidebar.collapsed .sidebar-footer {
  display: none;
}

.workspace-name {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #37352f;
  font-size: 14px;
  font-weight: 650;
}

.icon-button,
.row-menu-button,
.collapse-button,
.inspector-head button,
.favourite-button {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 6px;
  color: #787774;
  font-size: 20px;
}

.icon-button:hover,
.row-menu-button:hover,
.inspector-head button:hover,
.favourite-button:hover {
  background: #e9e9e7;
}

.search-wrap {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 22px;
  align-items: center;
  margin: 4px 10px 8px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #ededeb;
}

.search-wrap:focus-within {
  border-color: #d3d3d0;
  background: white;
}

.search-wrap svg,
.quick-create svg,
.tree-icon,
.content-name svg,
.empty-page svg,
.page-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-wrap svg {
  width: 16px;
  color: #9b9a97;
}

.search-wrap input {
  width: 100%;
  height: 32px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #37352f;
  font-size: 13px;
}

.search-wrap button {
  border: 0;
  background: transparent;
  color: #9b9a97;
  cursor: pointer;
}

.quick-create {
  display: grid;
  gap: 2px;
  padding: 0 8px 6px;
}

.quick-create button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5f5e5b;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.quick-create button:hover {
  background: #ededeb;
  color: #37352f;
}

.quick-create svg {
  width: 17px;
  height: 17px;
}

.tree-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 5px;
  color: #9b9a97;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.shortcut {
  font-size: 10px;
  font-weight: 500;
}

.tree {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 6px 12px;
}

.tree-entry {
  position: relative;
  opacity: 1;
}

.tree-entry.dragging {
  opacity: 0.4;
}

.tree-row {
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  min-width: 0;
  padding: 0 6px 0 calc(5px + var(--tree-depth, 0) * 16px);
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #5f5e5b;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.tree-row:hover,
.tree-row.active {
  background: #e9e9e7;
  color: #37352f;
}

.root-row {
  --tree-depth: 0;
  margin-bottom: 3px;
}

.collapse-button,
.tree-spacer {
  display: grid;
  width: 16px;
  height: 24px;
  flex: 0 0 16px;
  place-items: center;
  padding: 0;
  color: #9b9a97;
  font-size: 17px;
}

.tree-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin-right: 7px;
  color: #787774;
}

.tree-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  min-width: 0;
  height: 23px;
  flex: 1;
  padding: 0 5px;
  border: 1px solid #a8a8a5;
  border-radius: 4px;
  outline: 0;
  background: white;
  font-size: 13px;
}

.favourite-dot {
  margin-left: 5px;
  color: #b58a2a;
  font-size: 10px;
}

.row-menu-button {
  display: none;
  width: 26px;
  height: 24px;
  flex: 0 0 26px;
  padding: 0;
  border-radius: 4px;
  color: #9b9a97;
  font-size: 13px;
  letter-spacing: -1px;
}

.tree-row:hover .row-menu-button,
.tree-row.active .row-menu-button {
  display: block;
}

.context-menu {
  position: absolute;
  z-index: 40;
  top: 29px;
  right: 5px;
  width: 180px;
  padding: 5px;
  border: 1px solid #dededb;
  border-radius: 7px;
  background: white;
  box-shadow: 0 8px 24px rgba(15, 15, 15, 0.12);
}

.context-menu button {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #37352f;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.context-menu button:hover {
  background: #f1f1ef;
}

.context-menu .danger-action {
  color: #d44c47;
}

.menu-divider {
  height: 1px;
  margin: 4px -5px;
  background: #ededeb;
}

.tree-empty {
  padding: 18px 10px;
  color: #9b9a97;
  font-size: 12px;
  text-align: center;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 13px;
  border-top: 1px solid #e8e8e5;
  color: #9b9a97;
  font-size: 10px;
}

.main-area {
  min-width: 0;
  overflow: hidden;
  background: white;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 16px;
  border-bottom: 1px solid #efefed;
  background: rgba(255, 255, 255, 0.94);
}

.breadcrumbs {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: #9b9a97;
  font-size: 12px;
  white-space: nowrap;
}

.breadcrumbs button {
  max-width: 160px;
  overflow: hidden;
  padding: 3px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #787774;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.breadcrumbs button:hover {
  background: #f1f1ef;
  color: #37352f;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9b9a97;
  font-size: 11px;
}

.plain-button {
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #787774;
  font-size: 11px;
  cursor: pointer;
}

.plain-button:hover {
  background: #f1f1ef;
}

.folder-page,
.note-page {
  height: calc(100% - 46px);
  overflow: auto;
}

.page-width,
.note-width {
  width: min(100%, 850px);
  margin: 0 auto;
}

.page-width {
  padding: 78px 64px 100px;
}

.note-width {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  padding: 72px 68px 32px;
}

.page-kicker {
  margin-bottom: 10px;
  color: #9b9a97;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.folder-page h1 {
  margin: 0;
  color: #2f2e2a;
  font-size: 38px;
  font-weight: 720;
  letter-spacing: -0.035em;
}

.page-description {
  max-width: 580px;
  margin: 10px 0 0;
  color: #787774;
  font-size: 14px;
  line-height: 1.7;
}

.page-icon {
  width: 38px;
  height: 38px;
  margin-bottom: 15px;
  color: #787774;
}

.page-title-input,
.note-title-input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #2f2e2a;
  font-weight: 720;
  letter-spacing: -0.035em;
}

.page-title-input {
  font-size: 38px;
}

.folder-description {
  width: 100%;
  margin-top: 8px;
  padding: 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: #787774;
  font-size: 14px;
  line-height: 1.7;
}

.page-actions {
  display: flex;
  gap: 8px;
  margin-top: 28px;
}

.primary-action,
.secondary-action {
  height: 34px;
  padding: 0 13px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #37352f;
  background: #37352f;
  color: white;
}

.primary-action:hover {
  background: #1f1e1b;
}

.secondary-action {
  border: 1px solid #dededb;
  background: white;
  color: #5f5e5b;
}

.secondary-action:hover {
  background: #f7f7f5;
}

.list-heading,
.content-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 90px;
  align-items: center;
}

.list-heading {
  margin-top: 46px;
  padding: 0 10px 8px;
  border-bottom: 1px solid #ededeb;
  color: #9b9a97;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.content-row {
  width: 100%;
  min-height: 43px;
  padding: 6px 10px;
  border: 0;
  border-bottom: 1px solid #f0f0ee;
  background: transparent;
  color: #787774;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.content-row:hover {
  background: #f7f7f5;
}

.content-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  color: #37352f;
  font-size: 13px;
}

.content-name svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  color: #787774;
}

.content-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-page {
  display: flex;
  min-height: 250px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9b9a97;
  text-align: center;
}

.empty-page.compact {
  min-height: 170px;
}

.empty-page svg {
  width: 34px;
  height: 34px;
  margin-bottom: 12px;
}

.empty-page h2 {
  margin: 0;
  color: #5f5e5b;
  font-size: 14px;
  font-weight: 650;
}

.empty-page p {
  max-width: 360px;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.note-meta-line {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  color: #9b9a97;
  font-size: 11px;
}

.title-line {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.note-title-input {
  min-width: 0;
  flex: 1;
  font-size: 40px;
  line-height: 1.18;
}

.favourite-button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  margin-top: 7px;
  border-radius: 6px;
  color: #9b9a97;
  font-size: 23px;
}

.favourite-button.active {
  color: #b58a2a;
}

.inline-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}

.inline-tags span {
  padding: 3px 7px;
  border-radius: 4px;
  background: #f1f1ef;
  color: #787774;
  font-size: 10px;
}

.note-editor {
  width: 100%;
  min-height: 420px;
  flex: 1;
  margin-top: 28px;
  padding: 0;
  border: 0;
  outline: 0;
  overflow: auto;
  background: transparent;
  color: #37352f;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.9;
  white-space: pre-wrap;
}

.rich-editor:focus {
  outline: 0;
}

.rich-editor:empty::before {
  content: attr(data-placeholder);
  color: #c7c6c3;
  pointer-events: none;
}

.rich-editor img,
.note-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 14px 0;
  border: 1px solid #e8e8e5;
  border-radius: 10px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
  padding: 8px 0;
  border-top: 1px solid #f0f0ee;
  color: #aaa9a6;
  font-size: 11px;
}

.editor-toolbar button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid #dededb;
  border-radius: 6px;
  background: white;
  color: #5f5e5b;
  font-size: 11px;
  cursor: pointer;
}

.editor-toolbar button:hover {
  background: #f7f7f5;
}

.hidden-file-input {
  display: none;
}

.note-editor::placeholder,
.page-title-input::placeholder,
.note-title-input::placeholder,
.folder-description::placeholder {
  color: #c7c6c3;
}

.editor-footer {
  display: flex;
  gap: 16px;
  padding-top: 14px;
  border-top: 1px solid #f0f0ee;
  color: #aaa9a6;
  font-size: 10px;
}

.inspector {
  overflow: auto;
  padding: 14px;
  border-left: 1px solid #e8e8e5;
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 2px 14px;
}

.inspector-head h2 {
  margin: 0;
  color: #5f5e5b;
  font-size: 12px;
  font-weight: 650;
}

.inspector-head button {
  width: 28px;
  height: 26px;
  border-radius: 5px;
  color: #9b9a97;
}

.stat-list {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid #e4e4e1;
  border-radius: 7px;
  background: #e4e4e1;
}

.stat-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 11px;
  background: #fbfbfa;
  color: #787774;
  font-size: 12px;
}

.stat-list strong {
  color: #37352f;
}

.property-field {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  min-height: 38px;
  color: #787774;
  font-size: 11px;
}

.property-field input,
.property-field select {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  outline: 0;
  background: transparent;
  color: #37352f;
  font-size: 11px;
}

.property-field input:hover,
.property-field select:hover,
.property-field input:focus,
.property-field select:focus {
  border-color: #dededb;
  background: white;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  color: #787774;
  font-size: 11px;
}

.check-row input {
  accent-color: #37352f;
}

.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  border-bottom: 1px solid #ececea;
  color: #787774;
  font-size: 11px;
}

.property-row strong,
.property-row small {
  color: #37352f;
  font-weight: 500;
}

.property-row.stacked {
  align-items: flex-start;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.inspector-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e4e4e1;
}

.inspector-section h3 {
  margin: 0 0 10px;
  color: #787774;
  font-size: 10px;
  text-transform: uppercase;
}

.inspector-section p {
  margin: 7px 0;
  color: #787774;
  font-size: 10px;
  line-height: 1.5;
}

kbd {
  padding: 1px 4px;
  border: 1px solid #dededb;
  border-radius: 3px;
  background: white;
  color: #5f5e5b;
  font-size: 9px;
}

.action-stack {
  display: grid;
  gap: 4px;
}

.action-stack button {
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #5f5e5b;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.action-stack button:hover {
  background: #ededeb;
}

.action-stack .danger-text {
  color: #d44c47;
}

.date-list p {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.date-list small {
  color: #9b9a97;
  text-align: right;
}

.assistant-box {
  margin-top: 18px;
  border-top: 1px solid #e4e4e1;
}

.assistant-box summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 2px 8px;
  color: #787774;
  font-size: 11px;
  font-weight: 600;
  list-style: none;
  cursor: pointer;
}

.assistant-box summary::-webkit-details-marker {
  display: none;
}

.assistant-content {
  display: grid;
  gap: 8px;
}

.assistant-action,
.assistant-link {
  height: 31px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
}

.assistant-action {
  border: 1px solid #37352f;
  background: #37352f;
  color: white;
}

.assistant-link {
  border: 1px solid #dededb;
  background: white;
  color: #5f5e5b;
}

.assistant-action:disabled,
.assistant-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.assistant-content textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #dededb;
  border-radius: 5px;
  outline: 0;
  resize: vertical;
  background: white;
  color: #37352f;
  font-size: 11px;
  line-height: 1.5;
}

.assistant-content pre {
  max-height: 240px;
  margin: 3px 0 0;
  overflow: auto;
  padding: 9px;
  border-radius: 5px;
  background: #efefed;
  color: #5f5e5b;
  font-family: inherit;
  font-size: 10px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.toast {
  position: fixed;
  z-index: 100;
  right: 24px;
  bottom: 24px;
  padding: 9px 13px;
  border: 1px solid #2f2e2a;
  border-radius: 6px;
  background: #37352f;
  color: white;
  box-shadow: 0 8px 24px rgba(15, 15, 15, 0.18);
  font-size: 11px;
}

.toast-enter-active,
.toast-leave-active {
  transition: 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 1180px) {
  .study-shell {
    grid-template-columns: 250px minmax(0, 1fr);
  }

  .inspector {
    position: absolute;
    z-index: 30;
    top: 0;
    right: 0;
    width: 270px;
    height: 100%;
    box-shadow: -12px 0 28px rgba(15, 15, 15, 0.08);
  }
}

@media (max-width: 760px) {
  .study-shell {
    display: block;
    height: auto;
    min-height: 100vh;
    overflow: visible;
    border-radius: 0;
  }

  .sidebar {
    height: 330px;
    border-right: 0;
    border-bottom: 1px solid #e8e8e5;
  }

  .main-area {
    min-height: 700px;
  }

  .page-width,
  .note-width {
    padding: 48px 24px 72px;
  }

  .folder-page h1,
  .page-title-input,
  .note-title-input {
    font-size: 32px;
  }

  .list-heading,
  .content-row {
    grid-template-columns: minmax(0, 1fr) 75px;
  }

  .list-heading span:nth-child(2),
  .content-row > span:nth-child(2) {
    display: none;
  }

  .inspector {
    position: fixed;
    height: 100vh;
  }
}
</style>
