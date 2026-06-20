<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import VueApexCharts from "vue3-apexcharts";

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

/**
 * CalendarView.vue
 * GrowthOS Calendar + Category Manager + Copy/Paste/Duplicate + AI-ready Reports
 *
 * Required:
 * npm install @fullcalendar/vue3 @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
 * npm install vue3-apexcharts apexcharts
 *
 * Optional AI endpoint:
 * .env
 * VITE_GROWTHOS_AI_ENDPOINT=https://your-cloud-function-url
 *
 * AI endpoint should accept:
 * POST { action: "generate-report" | "ask-coach", payload: {...} }
 * and return:
 * { text: "..." }
 */

const AI_ENDPOINT = import.meta.env.VITE_GROWTHOS_AI_ENDPOINT || "";

const now = ref(new Date());
const events = ref([]);
const categories = ref([]);

const showEventForm = ref(false);
const showEventDetail = ref(false);
const showCategoryManager = ref(false);
const showReflectionModal = ref(false);

const upcomingExpanded = ref(false);
const reflectionEvent = ref(null);
const reflectionForm = ref(createEmptyReflection());
const reflectionAiResult = ref("");
const reflectionAiLoading = ref(false);

const selectedDate = ref(formatDateKey(new Date()));
const selectedEvent = ref(null);

const editingCategoryId = ref(null);
const categoryManagerTarget = ref("new");

const copiedEventTemplate = ref(null);

const generatedDailyAiReport = ref("");
const generatedWeeklyAiReport = ref("");
const aiQuestion = ref("");
const aiChatMessages = ref([]);
const aiLoading = ref(false);
const aiError = ref("");

let timer = null;
let unsubscribeEvents = null;
let unsubscribeCategories = null;

const defaultCategories = [
  {
    slug: "work",
    label: "Work",
    zh: "工作",
    icon: "💼",
    color: "#4f46e5",
    group: "work",
    isDefault: true,
  },
  {
    slug: "study",
    label: "Study",
    zh: "学习",
    icon: "📚",
    color: "#2563eb",
    group: "study",
    isDefault: true,
  },
  {
    slug: "teaching",
    label: "Teaching",
    zh: "教学",
    icon: "👩‍🏫",
    color: "#9333ea",
    group: "study",
    isDefault: true,
  },
  {
    slug: "pm",
    label: "PM",
    zh: "项目管理",
    icon: "🧩",
    color: "#0891b2",
    group: "work",
    isDefault: true,
  },
  {
    slug: "fitness",
    label: "Fitness",
    zh: "健身",
    icon: "💪",
    color: "#16a34a",
    group: "health",
    isDefault: true,
  },
  {
    slug: "rest",
    label: "Rest",
    zh: "休息",
    icon: "🌙",
    color: "#64748b",
    group: "rest",
    isDefault: true,
  },
  {
    slug: "life",
    label: "Life",
    zh: "生活",
    icon: "🏠",
    color: "#f97316",
    group: "life",
    isDefault: true,
  },
];

const groupMeta = {
  work: { label: "Work", zh: "工作", color: "#4f46e5" },
  study: { label: "Study", zh: "学习", color: "#2563eb" },
  health: { label: "Health", zh: "健康", color: "#16a34a" },
  rest: { label: "Rest", zh: "休息", color: "#64748b" },
  life: { label: "Life", zh: "生活", color: "#f97316" },
  social: { label: "Social", zh: "社交", color: "#db2777" },
  other: { label: "Other", zh: "其他", color: "#334155" },
};

const newEvent = ref(createEmptyEvent());
const categoryForm = ref(createEmptyCategory());

function createEmptyEvent(date = selectedDate.value, startTime = "", endTime = "") {
  return {
    title: "",
    categoryId: "",
    date,
    startTime,
    endTime,
    notes: "",
    status: "planned",
  };
}

function createEmptyCategory() {
  return {
    label: "",
    zh: "",
    icon: "✨",
    color: "#2563eb",
    group: "work",
  };
}

function createEmptyReflection() {
  return {
    summary: "",
    progress: "",
    shortcomings: "",
    learning: "",
    nextSteps: "",
    mood: "steady",
    rating: 3,
  };
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatTimeInput(date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getStartOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function minutesBetween(startTime, endTime) {
  if (!startTime || !endTime) return 0;

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (end <= start) return 0;
  return end - start;
}

function formatMinutes(minutes) {
  if (!minutes) return "0h";

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function makeSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryMeta(categoryIdOrSlug) {
  const found = categories.value.find((item) => {
    return (
      item.id === categoryIdOrSlug ||
      item.slug === categoryIdOrSlug ||
      item.value === categoryIdOrSlug
    );
  });

  if (found) return found;

  return {
    id: "unknown",
    slug: "other",
    label: "Other",
    zh: "其他",
    icon: "✨",
    color: "#334155",
    group: "other",
  };
}

function getEventCategory(event) {
  return getCategoryMeta(event.categoryId || event.category || event.categorySlug);
}

function getEventDuration(event) {
  return minutesBetween(event.startTime, event.endTime);
}

function getEventsByDate(dateKey) {
  return events.value
    .filter((event) => event.date === dateKey)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
}

function getEventsBetween(startDateKey, endDateKey) {
  return events.value
    .filter((event) => event.date >= startDateKey && event.date <= endDateKey)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
}

function isCategoryUsed(category) {
  return events.value.some((event) => {
    return event.categoryId === category.id || event.category === category.slug;
  });
}

function buildReport(targetEvents) {
  const groupMap = {};
  const categoryMap = {};

  targetEvents.forEach((event) => {
    const category = getEventCategory(event);
    const duration = getEventDuration(event);
    const group = category.group || "other";

    if (!groupMap[group]) {
      groupMap[group] = {
        key: group,
        label: groupMeta[group]?.label || group,
        zh: groupMeta[group]?.zh || "其他",
        color: groupMeta[group]?.color || "#334155",
        minutes: 0,
        events: 0,
        done: 0,
      };
    }

    groupMap[group].minutes += duration;
    groupMap[group].events += 1;
    if (event.status === "done") groupMap[group].done += 1;

    const categoryKey = category.id || category.slug;

    if (!categoryMap[categoryKey]) {
      categoryMap[categoryKey] = {
        key: categoryKey,
        label: category.label,
        zh: category.zh,
        icon: category.icon,
        color: category.color,
        group: category.group,
        minutes: 0,
        events: 0,
        done: 0,
      };
    }

    categoryMap[categoryKey].minutes += duration;
    categoryMap[categoryKey].events += 1;
    if (event.status === "done") categoryMap[categoryKey].done += 1;
  });

  const groupRows = Object.values(groupMap).sort((a, b) => b.minutes - a.minutes);
  const categoryRows = Object.values(categoryMap).sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = groupRows.reduce((sum, item) => sum + item.minutes, 0);
  const doneCount = targetEvents.filter((event) => event.status === "done").length;

  return {
    totalMinutes,
    totalEvents: targetEvents.length,
    doneCount,
    pendingCount: targetEvents.length - doneCount,
    groupRows,
    categoryRows,
  };
}

function buildLocalAiAdvice(report, periodName) {
  if (report.totalEvents === 0) {
    return `${periodName}: 还没有记录。先把工作、学习、休息、健身、睡眠都放进 Calendar，AI 才能分析你时间到底花去哪了。`;
  }

  const topGroup = report.groupRows[0];
  const workGroup = report.groupRows.find((item) => item.key === "work");
  const studyGroup = report.groupRows.find((item) => item.key === "study");
  const restGroup = report.groupRows.find((item) => item.key === "rest");
  const healthGroup = report.groupRows.find((item) => item.key === "health");
  const lifeGroup = report.groupRows.find((item) => item.key === "life");

  const lines = [];

  lines.push(
    `${periodName}: 你一共记录了 ${formatMinutes(report.totalMinutes)}，完成 ${report.doneCount}/${report.totalEvents} 个任务。`,
  );

  if (topGroup) {
    lines.push(
      `耗时最多的是 ${topGroup.label}（${topGroup.zh}），共 ${formatMinutes(topGroup.minutes)}。`,
    );
  }

  if ((workGroup?.minutes || 0) > report.totalMinutes * 0.6) {
    lines.push("工作占比偏高，容易出现“很忙但成长不足”。建议给 CCL / Teaching / IT 留一个不可移动学习块。");
  }

  if ((studyGroup?.minutes || 0) < 60 && report.totalMinutes >= 240) {
    lines.push("学习时间偏少。建议至少安排 45–60 分钟学习，不要等别人 push 你。");
  }

  if ((restGroup?.minutes || 0) === 0 && report.totalMinutes >= 300) {
    lines.push("休息/睡眠记录为 0。建议把睡眠和恢复也作为正式时间块记录，否则数据会失真。");
  }

  if ((healthGroup?.minutes || 0) >= 45) {
    lines.push("健康/健身有记录，这是一个很好的稳定器。保持即可，不需要过度加量。");
  }

  if ((lifeGroup?.minutes || 0) > report.totalMinutes * 0.35) {
    lines.push("生活/娱乐占比不低。如果你觉得学习不够，优先从这里挪 30 分钟给学习。");
  }

  return lines.join(" ");
}

function buildLocalReportText(type) {
  const report = type === "daily" ? dailyReport.value : weeklyReport.value;
  const period =
    type === "daily"
      ? selectedDate.value
      : `${weekStartKey.value} - ${weekEndKey.value}`;

  if (report.totalEvents === 0) {
    return `【${type === "daily" ? "日报" : "周报"}】${period}\n\n目前没有记录。先把工作、学习、睡眠、休息、娱乐、健身都放进 Calendar。`;
  }

  const lines = [];

  lines.push(`【${type === "daily" ? "日报" : "周报"}】${period}`);
  lines.push("");
  lines.push(`总记录时间：${formatMinutes(report.totalMinutes)}`);
  lines.push(`任务完成情况：${report.doneCount}/${report.totalEvents}`);
  lines.push("");
  lines.push("时间占比：");

  report.groupRows.forEach((item) => {
    const percent = report.totalMinutes
      ? Math.round((item.minutes / report.totalMinutes) * 100)
      : 0;
    lines.push(`- ${item.label}（${item.zh}）：${formatMinutes(item.minutes)}，${percent}%`);
  });

  lines.push("");
  lines.push("建议：");
  lines.push(buildLocalAiAdvice(report, type === "daily" ? "Daily Report" : "Weekly Report"));

  return lines.join("\n");
}

const todayKey = computed(() => formatDateKey(now.value));

const currentTimeText = computed(() => {
  return now.value.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });
});

const todayDateText = computed(() => {
  return now.value.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
});

const selectedDateText = computed(() => {
  return parseDateKey(selectedDate.value).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
});

const weekStartKey = computed(() => {
  return formatDateKey(getStartOfWeek(parseDateKey(selectedDate.value)));
});

const weekEndKey = computed(() => {
  return formatDateKey(addDays(getStartOfWeek(parseDateKey(selectedDate.value)), 6));
});

const todayEvents = computed(() => getEventsByDate(todayKey.value));
const selectedDateEvents = computed(() => getEventsByDate(selectedDate.value));

const upcomingEvents = computed(() => {
  return events.value
    .filter((event) => event.date >= todayKey.value)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || "").localeCompare(b.startTime || "");
    })
    .slice(0, 10);
});

const visibleUpcomingEvents = computed(() => {
  return upcomingExpanded.value
    ? upcomingEvents.value
    : upcomingEvents.value.slice(0, 4);
});

const selectedDateReflectionEvents = computed(() => {
  return selectedDateEvents.value.map((event) => ({
    ...event,
    hasReflection: Boolean(
      event.reflection?.summary ||
      event.reflection?.progress ||
      event.reflection?.shortcomings ||
      event.reflection?.learning ||
      event.reflection?.nextSteps
    ),
  }));
});

const reflectionCompletedCount = computed(() => {
  return selectedDateReflectionEvents.value.filter((event) => event.hasReflection).length;
});

const weeklyEvents = computed(() => {
  return getEventsBetween(weekStartKey.value, weekEndKey.value);
});

const todayDoneCount = computed(() => {
  return todayEvents.value.filter((event) => event.status === "done").length;
});

const dailyReport = computed(() => buildReport(selectedDateEvents.value));
const weeklyReport = computed(() => buildReport(weeklyEvents.value));

const dailyAiAdvice = computed(() =>
  buildLocalAiAdvice(dailyReport.value, "Daily Report"),
);

const weeklyAiAdvice = computed(() =>
  buildLocalAiAdvice(weeklyReport.value, "Weekly Report"),
);

const dailyChartSeries = computed(() =>
  dailyReport.value.groupRows.map((item) => item.minutes),
);

const weeklyChartSeries = computed(() =>
  weeklyReport.value.groupRows.map((item) => item.minutes),
);

const dailyChartOptions = computed(() => buildChartOptions(dailyReport.value));
const weeklyChartOptions = computed(() => buildChartOptions(weeklyReport.value));

const copiedEventLabel = computed(() => {
  if (!copiedEventTemplate.value) return "";
  return `${copiedEventTemplate.value.title || "Untitled"} · ${
    copiedEventTemplate.value.startTime || "Anytime"
  }`;
});

function buildChartOptions(report) {
  return {
    chart: {
      type: "donut",
      toolbar: { show: false },
    },
    labels: report.groupRows.map((item) => `${item.label} ${item.zh}`),
    colors: report.groupRows.map((item) => item.color),
    legend: {
      position: "bottom",
      fontSize: "12px",
    },
    dataLabels: {
      enabled: true,
    },
    stroke: {
      width: 0,
    },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              formatter: function (w) {
                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                return formatMinutes(total);
              },
            },
          },
        },
      },
    },
    tooltip: {
      y: {
        formatter: (value) => formatMinutes(value),
      },
    },
  };
}

const calendarEvents = computed(() => {
  return events.value.map((event) => {
    const meta = getEventCategory(event);

    return {
      id: event.id,
      title: `${meta.icon} ${event.title}`,
      start: event.startTime ? `${event.date}T${event.startTime}` : event.date,
      end: event.endTime ? `${event.date}T${event.endTime}` : undefined,
      allDay: !event.startTime,
      backgroundColor: meta.color,
      borderColor: meta.color,
      textColor: "#ffffff",
      extendedProps: {
        categoryId: event.categoryId,
        status: event.status,
        notes: event.notes,
      },
    };
  });
});

const calendarOptions = computed(() => {
  return {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: "timeGridWeek",
    height: 650,
    nowIndicator: true,
    selectable: true,
    editable: true,
    dayMaxEvents: true,
    slotMinTime: "05:00:00",
    slotMaxTime: "24:00:00",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    buttonText: {
      today: "Today",
      month: "Month",
      week: "Week",
      day: "Day",
    },
    events: calendarEvents.value,
    dateClick: handleDateClick,
    eventClick: handleEventClick,
    eventDrop: handleEventMove,
    eventResize: handleEventMove,
  };
});

async function seedDefaultCategoriesIfNeeded() {
  const snapshot = await getDocs(collection(db, "categories"));
  if (!snapshot.empty) return;

  await Promise.all(
    defaultCategories.map((category) => {
      return addDoc(collection(db, "categories"), {
        ...category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
  );
}

function loadCategories() {
  const q = query(collection(db, "categories"), orderBy("label", "asc"));

  return onSnapshot(q, (snapshot) => {
    categories.value = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    if (!newEvent.value.categoryId && categories.value.length > 0) {
      const study = categories.value.find((item) => item.slug === "study");
      newEvent.value.categoryId = study?.id || categories.value[0].id;
    }
  });
}

function loadEvents() {
  const q = query(collection(db, "events"), orderBy("date", "asc"));

  return onSnapshot(q, (snapshot) => {
    events.value = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  });
}

function openAddForm(date = selectedDate.value, startTime = "", endTime = "") {
  const defaultCategory =
    categories.value.find((item) => item.slug === "study") || categories.value[0];

  newEvent.value = createEmptyEvent(date, startTime, endTime);
  newEvent.value.categoryId = defaultCategory?.id || "";

  showEventForm.value = true;
  showEventDetail.value = false;
}

function openEventDetail(event) {
  selectedEvent.value = {
    ...event,
    categoryId:
      event.categoryId ||
      categories.value.find((item) => item.slug === event.category)?.id ||
      "",
  };

  showEventDetail.value = true;
  showEventForm.value = false;
}

function openCategoryManager(target = "new") {
  categoryManagerTarget.value = target;
  editingCategoryId.value = null;
  categoryForm.value = createEmptyCategory();
  showCategoryManager.value = true;
}

function editCategory(category) {
  editingCategoryId.value = category.id;
  categoryForm.value = {
    label: category.label || "",
    zh: category.zh || "",
    icon: category.icon || "✨",
    color: category.color || "#2563eb",
    group: category.group || "other",
  };
}

function cancelEditCategory() {
  editingCategoryId.value = null;
  categoryForm.value = createEmptyCategory();
}

async function saveCategory() {
  if (!categoryForm.value.label.trim()) {
    alert("Please enter a category name.");
    return;
  }

  const payload = {
    label: categoryForm.value.label.trim(),
    zh: categoryForm.value.zh.trim() || categoryForm.value.label.trim(),
    icon: categoryForm.value.icon.trim() || "✨",
    color: categoryForm.value.color || "#2563eb",
    group: categoryForm.value.group || "other",
    slug: makeSlug(categoryForm.value.label.trim()),
    updatedAt: serverTimestamp(),
  };

  if (editingCategoryId.value) {
    await updateDoc(doc(db, "categories", editingCategoryId.value), payload);
    cancelEditCategory();
    return;
  }

  const docRef = await addDoc(collection(db, "categories"), {
    ...payload,
    isDefault: false,
    createdAt: serverTimestamp(),
  });

  if (categoryManagerTarget.value === "new") {
    newEvent.value.categoryId = docRef.id;
  }

  if (categoryManagerTarget.value === "detail" && selectedEvent.value) {
    selectedEvent.value.categoryId = docRef.id;
  }

  cancelEditCategory();
}

async function removeCategory(category) {
  if (isCategoryUsed(category)) {
    alert("This category is used by existing events. Please change those events first.");
    return;
  }

  const confirmed = confirm(`Delete category "${category.label}"?`);
  if (!confirmed) return;

  await deleteDoc(doc(db, "categories", category.id));
}

function handleDateClick(info) {
  const clickedDate = formatDateKey(info.date);
  selectedDate.value = clickedDate;

  if (info.allDay) {
    openAddForm(clickedDate);
    return;
  }

  const startTime = formatTimeInput(info.date);
  const endTime = formatTimeInput(addMinutes(info.date, 60));

  openAddForm(clickedDate, startTime, endTime);
}

function handleEventClick(info) {
  const event = events.value.find((item) => item.id === info.event.id);

  if (event) {
    selectedDate.value = event.date;
    openEventDetail(event);
  }
}

async function handleEventMove(info) {
  try {
    const movedEvent = info.event;
    const start = movedEvent.start;
    const end = movedEvent.end;

    if (!start) return;

    await updateDoc(doc(db, "events", movedEvent.id), {
      date: formatDateKey(start),
      startTime: movedEvent.allDay ? "" : formatTimeInput(start),
      endTime: end && !movedEvent.allDay ? formatTimeInput(end) : "",
      durationMinutes:
        end && !movedEvent.allDay
          ? minutesBetween(formatTimeInput(start), formatTimeInput(end))
          : 0,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(error);
    if (info.revert) info.revert();
  }
}

function getEventPayloadFromForm(form) {
  const category = getCategoryMeta(form.categoryId);

  return {
    title: form.title.trim(),
    categoryId: form.categoryId,
    category: category.slug || "other",
    categoryLabel: category.label,
    categoryGroup: category.group || "other",
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    durationMinutes: minutesBetween(form.startTime, form.endTime),
    notes: (form.notes || "").trim(),
    status: form.status || "planned",
    updatedAt: serverTimestamp(),
  };
}

async function addEvent() {
  if (!newEvent.value.title.trim()) {
    alert("Please enter an event title.");
    return;
  }

  if (!newEvent.value.categoryId) {
    alert("Please select a category.");
    return;
  }

  await addDoc(collection(db, "events"), {
    ...getEventPayloadFromForm(newEvent.value),
    createdAt: serverTimestamp(),
  });

  showEventForm.value = false;
}

async function saveEventDetail() {
  if (!selectedEvent.value) return;

  if (!selectedEvent.value.title.trim()) {
    alert("Please enter an event title.");
    return;
  }

  if (!selectedEvent.value.categoryId) {
    alert("Please select a category.");
    return;
  }

  await updateDoc(
    doc(db, "events", selectedEvent.value.id),
    getEventPayloadFromForm(selectedEvent.value),
  );

  showEventDetail.value = false;
}

async function toggleDone(event) {
  await updateDoc(doc(db, "events", event.id), {
    status: event.status === "done" ? "planned" : "done",
    updatedAt: serverTimestamp(),
  });
}

async function removeEvent(eventId) {
  const confirmed = confirm("Delete this event?");
  if (!confirmed) return;

  await deleteDoc(doc(db, "events", eventId));
  showEventDetail.value = false;
}

function buildEventTemplate(event) {
  return {
    title: event.title || "",
    categoryId: event.categoryId || "",
    category: event.category || "",
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    notes: event.notes || "",
  };
}

function copyEventTemplate(event) {
  const template = buildEventTemplate(event);
  copiedEventTemplate.value = template;

  localStorage.setItem("growthos_copied_event_template", JSON.stringify(template));

  alert(`Copied: ${template.title || "Untitled event"}`);
}

function loadCopiedEventTemplate() {
  try {
    const raw = localStorage.getItem("growthos_copied_event_template");
    if (!raw) return;
    copiedEventTemplate.value = JSON.parse(raw);
  } catch (error) {
    console.error(error);
  }
}

function clearCopiedEventTemplate() {
  copiedEventTemplate.value = null;
  localStorage.removeItem("growthos_copied_event_template");
}

function pasteTemplateToNewEvent() {
  if (!copiedEventTemplate.value) {
    alert("No copied event template.");
    return;
  }

  newEvent.value = {
    ...newEvent.value,
    title: copiedEventTemplate.value.title,
    categoryId: copiedEventTemplate.value.categoryId,
    startTime: copiedEventTemplate.value.startTime,
    endTime: copiedEventTemplate.value.endTime,
    notes: copiedEventTemplate.value.notes,
  };
}

function pasteTemplateToSelectedEvent() {
  if (!copiedEventTemplate.value || !selectedEvent.value) {
    alert("No copied event template.");
    return;
  }

  selectedEvent.value = {
    ...selectedEvent.value,
    title: copiedEventTemplate.value.title,
    categoryId: copiedEventTemplate.value.categoryId,
    startTime: copiedEventTemplate.value.startTime,
    endTime: copiedEventTemplate.value.endTime,
    notes: copiedEventTemplate.value.notes,
  };
}

async function createEventFromTemplate(template, targetDate) {
  if (!template) {
    alert("No copied event template.");
    return;
  }

  const category = getCategoryMeta(template.categoryId || template.category);
  const categoryId = category.id === "unknown" ? "" : category.id;

  if (!template.title?.trim()) {
    alert("Copied event has no title.");
    return;
  }

  if (!categoryId) {
    alert("Copied event category is missing. Please choose a category.");
    return;
  }

  await addDoc(collection(db, "events"), {
    title: template.title.trim(),
    categoryId,
    category: category.slug || "other",
    categoryLabel: category.label,
    categoryGroup: category.group || "other",
    date: targetDate,
    startTime: template.startTime || "",
    endTime: template.endTime || "",
    durationMinutes: minutesBetween(template.startTime, template.endTime),
    notes: template.notes || "",
    status: "planned",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function duplicateEventToDate(event, targetDate) {
  await createEventFromTemplate(buildEventTemplate(event), targetDate);
}

async function duplicateEventToTomorrow(event) {
  const targetDate = formatDateKey(addDays(parseDateKey(event.date), 1));
  await duplicateEventToDate(event, targetDate);
  alert(`Duplicated to ${targetDate}`);
}

async function duplicateEventToNextWeek(event) {
  const targetDate = formatDateKey(addDays(parseDateKey(event.date), 7));
  await duplicateEventToDate(event, targetDate);
  alert(`Duplicated to ${targetDate}`);
}

async function duplicateEventToSelectedDate(event) {
  await duplicateEventToDate(event, selectedDate.value);
  alert(`Duplicated to ${selectedDate.value}`);
}

async function pasteCopiedTemplateToSelectedDate() {
  if (!copiedEventTemplate.value) {
    alert("No copied event template.");
    return;
  }

  await createEventFromTemplate(copiedEventTemplate.value, selectedDate.value);
  alert(`Pasted to ${selectedDate.value}`);
}


function openReflection(event) {
  reflectionEvent.value = { ...event };
  reflectionForm.value = {
    ...createEmptyReflection(),
    ...(event.reflection || {}),
    rating: Number(event.reflection?.rating || 3),
  };
  reflectionAiResult.value = event.reflectionAiAnalysis || "";
  showReflectionModal.value = true;
  showEventDetail.value = false;
}

function closeReflection() {
  showReflectionModal.value = false;
  reflectionEvent.value = null;
  reflectionForm.value = createEmptyReflection();
  reflectionAiResult.value = "";
}

function hasReflectionContent() {
  const value = reflectionForm.value;
  return Boolean(
    value.summary.trim() ||
    value.progress.trim() ||
    value.shortcomings.trim() ||
    value.learning.trim() ||
    value.nextSteps.trim()
  );
}

async function saveReflection(options = {}) {
  if (!reflectionEvent.value) return;

  if (!hasReflectionContent() && !options.allowEmpty) {
    alert("Please write at least one reflection note.");
    return;
  }

  const reflection = {
    summary: reflectionForm.value.summary.trim(),
    progress: reflectionForm.value.progress.trim(),
    shortcomings: reflectionForm.value.shortcomings.trim(),
    learning: reflectionForm.value.learning.trim(),
    nextSteps: reflectionForm.value.nextSteps.trim(),
    mood: reflectionForm.value.mood || "steady",
    rating: Number(reflectionForm.value.rating || 3),
  };

  await updateDoc(doc(db, "events", reflectionEvent.value.id), {
    reflection,
    reflectionAiAnalysis: reflectionAiResult.value || "",
    reflectionUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (!options.keepOpen) {
    closeReflection();
  }
}

function buildReflectionPayload() {
  if (!reflectionEvent.value) return null;

  const category = getEventCategory(reflectionEvent.value);

  return {
    eventId: reflectionEvent.value.id,
    title: reflectionEvent.value.title,
    date: reflectionEvent.value.date,
    startTime: reflectionEvent.value.startTime || "",
    endTime: reflectionEvent.value.endTime || "",
    durationMinutes: getEventDuration(reflectionEvent.value),
    category: category.label,
    categoryZh: category.zh,
    group: category.group,
    plannedNotes: reflectionEvent.value.notes || "",
    status: reflectionEvent.value.status || "planned",
    reflection: {
      summary: reflectionForm.value.summary.trim(),
      progress: reflectionForm.value.progress.trim(),
      shortcomings: reflectionForm.value.shortcomings.trim(),
      learning: reflectionForm.value.learning.trim(),
      nextSteps: reflectionForm.value.nextSteps.trim(),
      mood: reflectionForm.value.mood,
      rating: Number(reflectionForm.value.rating || 3),
    },
  };
}

function buildLocalReflectionAnalysis(payload) {
  const r = payload.reflection;
  const lines = [];

  lines.push(`【${payload.title} · 工作复盘】`);

  if (r.rating >= 4) {
    lines.push("整体完成度不错，你对这次工作的掌控感较强。");
  } else if (r.rating <= 2) {
    lines.push("这次工作的完成感偏低，建议先区分：是准备不足、执行受阻，还是目标本身不清晰。");
  } else {
    lines.push("整体表现中等，已经有可保留的部分，也有明确的优化空间。");
  }

  if (r.progress) {
    lines.push(`值得保留：${r.progress}`);
  } else {
    lines.push("值得保留：下次至少记录一个具体做得好的动作，避免复盘只看不足。");
  }

  if (r.shortcomings) {
    lines.push(`需要改善：${r.shortcomings}`);
  } else {
    lines.push("需要改善：目前不足描述较少，可以从准备、沟通、时间控制、结果质量四个方向补充。");
  }

  if (r.learning) {
    lines.push(`关键学习：${r.learning}`);
  }

  if (r.nextSteps) {
    lines.push(`下一步：${r.nextSteps}`);
  } else {
    lines.push("下一步：把一个改进点转成下一次工作前可执行的动作，例如提前准备清单、设置完成标准或预留检查时间。");
  }

  lines.push("建议你下次复盘时继续使用“事实 → 原因 → 调整动作”的结构，会比单纯评价自己更有效。");

  return lines.join("\n\n");
}

async function analyzeReflection() {
  if (!reflectionEvent.value) return;

  if (!hasReflectionContent()) {
    alert("Please write your reflection before asking AI to analyse it.");
    return;
  }

  reflectionAiLoading.value = true;
  aiError.value = "";

  try {
    const payload = buildReflectionPayload();

    let text = await callAiBackend("analyze-reflection", {
      reflection: payload,
      instruction:
        "You are Joy's GrowthOS reflection coach. Reply in Chinese. Analyse the work reflection using evidence from the event and notes. Identify strengths, root causes of shortcomings, patterns, and 2-3 concrete next actions. Be direct but supportive. Do not invent facts.",
    });

    if (!text) {
      text = buildLocalReflectionAnalysis(payload);
    }

    reflectionAiResult.value = text;
    await saveReflection({ keepOpen: true });
  } catch (error) {
    console.error(error);
    aiError.value = "AI reflection analysis failed. Using local analysis instead.";
    reflectionAiResult.value = buildLocalReflectionAnalysis(buildReflectionPayload());
    await saveReflection({ keepOpen: true });
  } finally {
    reflectionAiLoading.value = false;
  }
}

function getAiPayload(type) {
  const report = type === "daily" ? dailyReport.value : weeklyReport.value;
  const targetEvents = type === "daily" ? selectedDateEvents.value : weeklyEvents.value;

  return {
    type,
    date:
      type === "daily"
        ? selectedDate.value
        : `${weekStartKey.value} - ${weekEndKey.value}`,
    totalMinutes: report.totalMinutes,
    totalEvents: report.totalEvents,
    doneCount: report.doneCount,
    pendingCount: report.pendingCount,
    byGroup: report.groupRows,
    byCategory: report.categoryRows,
    events: targetEvents.map((event) => {
      const category = getEventCategory(event);

      return {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        durationMinutes: getEventDuration(event),
        category: category.label,
        categoryZh: category.zh,
        group: category.group,
        status: event.status,
        notes: event.notes || "",
        reflection: event.reflection || null,
        reflectionAiAnalysis: event.reflectionAiAnalysis || "",
      };
    }),
  };
}

async function copyAiPayload(type) {
  const payload = getAiPayload(type);
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  alert(`${type} AI payload copied.`);
}

async function saveAiReport(type, text) {
  await addDoc(collection(db, "aiReports"), {
    type,
    text,
    payload: getAiPayload(type),
    createdAt: serverTimestamp(),
  });
}

async function callAiBackend(action, payload) {
  if (!AI_ENDPOINT) return null;

  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI endpoint error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || data.result || "";
}

async function generateAiReport(type) {
  aiLoading.value = true;
  aiError.value = "";

  try {
    let text = null;

    const payload = {
      report: getAiPayload(type),
      instruction:
        "You are Joy's GrowthOS AI Coach. Reply in Chinese. Analyze time allocation, task progress, work/study/rest balance, risks, and give practical next-step suggestions.",
    };

    text = await callAiBackend("generate-report", payload);

    if (!text) {
      text = buildLocalReportText(type);
    }

    if (type === "daily") {
      generatedDailyAiReport.value = text;
    } else {
      generatedWeeklyAiReport.value = text;
    }

    await saveAiReport(type, text);
  } catch (error) {
    console.error(error);
    aiError.value = "AI request failed. Using local report instead.";

    const fallbackText = buildLocalReportText(type);

    if (type === "daily") {
      generatedDailyAiReport.value = fallbackText;
    } else {
      generatedWeeklyAiReport.value = fallbackText;
    }
  } finally {
    aiLoading.value = false;
  }
}

async function askAiCoach() {
  if (!aiQuestion.value.trim()) {
    alert("Please type a question.");
    return;
  }

  const question = aiQuestion.value.trim();
  aiQuestion.value = "";
  aiError.value = "";

  aiChatMessages.value.push({
    role: "user",
    text: question,
  });

  aiLoading.value = true;

  try {
    const payload = {
      question,
      today: getAiPayload("daily"),
      week: getAiPayload("weekly"),
      instruction:
        "You are Joy's GrowthOS AI Coach. Reply in Chinese. Be direct, warm, practical. Focus on time usage, study consistency, work pressure, rest, and career growth.",
    };

    let text = await callAiBackend("ask-coach", payload);

    if (!text) {
      text = buildLocalCoachAnswer(question);
    }

    aiChatMessages.value.push({
      role: "assistant",
      text,
    });
  } catch (error) {
    console.error(error);
    aiError.value = "AI request failed. Using local answer instead.";

    aiChatMessages.value.push({
      role: "assistant",
      text: buildLocalCoachAnswer(question),
    });
  } finally {
    aiLoading.value = false;
  }
}

function buildLocalCoachAnswer(question) {
  const report = weeklyReport.value;
  const topGroup = report.groupRows[0];

  if (report.totalEvents === 0) {
    return "你现在还没有足够数据。先把今天和本周的工作、学习、睡眠、娱乐、健身都记录进去，我才能比较准确地分析。";
  }

  const lines = [];

  lines.push(`你问的是：“${question}”`);
  lines.push("");
  lines.push(`从本周数据看，你一共记录了 ${formatMinutes(report.totalMinutes)}。`);

  if (topGroup) {
    lines.push(`目前占比最高的是 ${topGroup.label}（${topGroup.zh}）：${formatMinutes(topGroup.minutes)}。`);
  }

  lines.push(buildLocalAiAdvice(report, "Weekly Coach"));

  return lines.join("\n");
}

onMounted(async () => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 1000);

  loadCopiedEventTemplate();

  await seedDefaultCategoriesIfNeeded();

  unsubscribeCategories = loadCategories();
  unsubscribeEvents = loadEvents();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (unsubscribeCategories) unsubscribeCategories();
  if (unsubscribeEvents) unsubscribeEvents();
});
</script>

<template>
  <section class="calendar-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Calendar · 日程管理</p>
        <h1>Today & Upcoming</h1>
        <p class="subtitle">
          Record work, study, rest and life blocks for AI growth analysis.
        </p>
      </div>

      <div class="header-actions">
        <div class="time-chip">
          <span>{{ todayDateText }}</span>
          <strong>{{ currentTimeText }}</strong>
        </div>

        <button class="primary-btn" @click="openAddForm(todayKey)">
          + Add Event
        </button>
      </div>
    </header>

    <div v-if="copiedEventTemplate" class="copy-banner">
      <div>
        <strong>Copied template:</strong>
        <span>{{ copiedEventLabel }}</span>
      </div>

      <div class="copy-banner-actions">
        <button class="copy-btn" @click="pasteCopiedTemplateToSelectedDate">
          Paste to Selected Date
        </button>
        <button class="ghost-btn" @click="clearCopiedEventTemplate">
          Clear
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>Today</span>
        <strong>{{ todayEvents.length }}</strong>
        <p>events planned</p>
      </div>

      <div class="summary-card">
        <span>Done</span>
        <strong>{{ todayDoneCount }}</strong>
        <p>completed today</p>
      </div>

      <div class="summary-card">
        <span>Weekly Time</span>
        <strong>{{ formatMinutes(weeklyReport.totalMinutes) }}</strong>
        <p>tracked this week</p>
      </div>
    </div>

    <div class="calendar-grid">
      <section class="left-panel">
        <div class="panel-card">
          <div class="panel-title">
            <div>
              <h2>Today</h2>
              <p>{{ todayDateText }}</p>
            </div>
          </div>

          <div v-if="todayEvents.length === 0" class="empty-state small">
            <strong>No events today</strong>
            <span>Add your first thing for today.</span>
          </div>

          <div v-else class="event-list">
            <div
              v-for="event in todayEvents"
              :key="event.id"
              class="event-item"
              :class="{ done: event.status === 'done' }"
            >
              <button class="event-main" @click="openEventDetail(event)">
                <div
                  class="event-icon"
                  :style="{ color: getEventCategory(event).color }"
                >
                  {{ getEventCategory(event).icon }}
                </div>

                <div class="event-body">
                  <div class="event-title-row">
                    <h3>{{ event.title }}</h3>
                    <span>{{ formatMinutes(getEventDuration(event)) }}</span>
                  </div>

                  <p>
                    {{ event.startTime || "Anytime" }}
                    <span v-if="event.endTime"> - {{ event.endTime }}</span>
                  </p>

                  <small>
                    {{ getEventCategory(event).label }} ·
                    {{ getEventCategory(event).zh }}
                  </small>
                </div>
              </button>

              <button class="mini-status-btn" @click="toggleDone(event)">
                {{ event.status === "done" ? "Undo" : "Done" }}
              </button>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title">
            <div>
              <h2>Upcoming</h2>
              <p>Next tasks and time blocks</p>
            </div>

            <button
              v-if="upcomingEvents.length > 4"
              class="collapse-btn"
              @click="upcomingExpanded = !upcomingExpanded"
            >
              {{ upcomingExpanded ? "Collapse" : `Show all (${upcomingEvents.length})` }}
              <span :class="{ rotated: upcomingExpanded }">⌄</span>
            </button>
          </div>

          <div v-if="upcomingEvents.length === 0" class="empty-state small">
            <strong>No upcoming events</strong>
            <span>Your week is empty for now.</span>
          </div>

          <div v-else class="upcoming-list">
            <button
              v-for="event in visibleUpcomingEvents"
              :key="event.id"
              class="upcoming-item"
              @click="openEventDetail(event)"
            >
              <div class="upcoming-date">
                <strong>
                  {{
                    parseDateKey(event.date).toLocaleDateString("en-AU", {
                      day: "numeric",
                    })
                  }}
                </strong>
                <span>
                  {{
                    parseDateKey(event.date).toLocaleDateString("en-AU", {
                      month: "short",
                    })
                  }}
                </span>
              </div>

              <div class="upcoming-main">
                <h3>{{ getEventCategory(event).icon }} {{ event.title }}</h3>
                <p>
                  {{ event.startTime || "Anytime" }}
                  ·
                  {{ getEventCategory(event).label }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section class="calendar-panel">
        <div class="calendar-card">
          <div class="calendar-top">
            <div>
              <h2>Calendar</h2>
              <p>
                Click a time slot to add. Click event to edit. Drag to move.
              </p>
            </div>

            <div class="calendar-top-actions">
              <div class="selected-chip">Selected: {{ selectedDateText }}</div>

              <button
                v-if="copiedEventTemplate"
                class="secondary-btn"
                @click="pasteCopiedTemplateToSelectedDate"
              >
                Paste
              </button>
            </div>
          </div>

          <FullCalendar :options="calendarOptions" />
        </div>
      </section>
    </div>


    <section class="reflection-section">
      <div class="reflection-header">
        <div>
          <p class="eyebrow">Work Notes · 工作复盘</p>
          <h2>{{ selectedDateText }}</h2>
          <p>
            Calendar 负责安排，Work Notes 负责记录这份工作结束后你做得怎么样。
          </p>
        </div>

        <div class="reflection-progress">
          <strong>{{ reflectionCompletedCount }}/{{ selectedDateReflectionEvents.length }}</strong>
          <span>reflections completed</span>
        </div>
      </div>

      <div v-if="selectedDateReflectionEvents.length === 0" class="empty-state small">
        <strong>No work or task on this date</strong>
        <span>Add an event in Calendar first. It will appear here automatically.</span>
      </div>

      <div v-else class="reflection-list">
        <article
          v-for="event in selectedDateReflectionEvents"
          :key="event.id"
          class="reflection-card"
          :class="{ completed: event.hasReflection }"
        >
          <div class="reflection-card-top">
            <div
              class="reflection-event-icon"
              :style="{ backgroundColor: `${getEventCategory(event).color}18`, color: getEventCategory(event).color }"
            >
              {{ getEventCategory(event).icon }}
            </div>

            <div class="reflection-card-main">
              <div class="reflection-title-row">
                <h3>{{ event.title }}</h3>
                <span :class="event.hasReflection ? 'reflection-done' : 'reflection-pending'">
                  {{ event.hasReflection ? "Reflected" : "To reflect" }}
                </span>
              </div>

              <p>
                {{ event.startTime || "Anytime" }}
                <span v-if="event.endTime">–{{ event.endTime }}</span>
                · {{ getEventCategory(event).label }}
              </p>

              <small v-if="event.reflection?.summary">
                {{ event.reflection.summary }}
              </small>
              <small v-else>
                完成这份工作后，写下进步、不足、学习和下一步。
              </small>
            </div>
          </div>

          <div class="reflection-card-actions">
            <div v-if="event.reflection?.rating" class="reflection-rating">
              <span>Self-rating</span>
              <strong>{{ event.reflection.rating }}/5</strong>
            </div>

            <button class="reflection-open-btn" @click="openReflection(event)">
              {{ event.hasReflection ? "Edit Reflection" : "Write Reflection" }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="report-grid">
      <div class="report-card">
        <div class="report-header">
          <div>
            <h2>Daily AI Report</h2>
            <p>{{ selectedDateText }}</p>
          </div>

          <div class="report-actions">
            <button class="secondary-btn" :disabled="aiLoading" @click="generateAiReport('daily')">
              {{ aiLoading ? "Generating..." : "Generate" }}
            </button>

            <button class="secondary-btn" @click="copyAiPayload('daily')">
              Copy Payload
            </button>
          </div>
        </div>

        <div v-if="dailyReport.totalMinutes === 0" class="empty-state small">
          <strong>No tracked time for this day</strong>
          <span>Add events with start and end time first.</span>
        </div>

        <div v-else class="report-content">
          <VueApexCharts
            type="donut"
            height="250"
            :options="dailyChartOptions"
            :series="dailyChartSeries"
          />

          <div class="ai-advice">
            <strong>AI Coach Draft</strong>
            <p>{{ dailyAiAdvice }}</p>
          </div>

          <div v-if="generatedDailyAiReport" class="generated-report">
            <strong>Generated Daily Report</strong>
            <pre>{{ generatedDailyAiReport }}</pre>
          </div>
        </div>
      </div>

      <div class="report-card">
        <div class="report-header">
          <div>
            <h2>Weekly AI Report</h2>
            <p>{{ weekStartKey }} - {{ weekEndKey }}</p>
          </div>

          <div class="report-actions">
            <button class="secondary-btn" :disabled="aiLoading" @click="generateAiReport('weekly')">
              {{ aiLoading ? "Generating..." : "Generate" }}
            </button>

            <button class="secondary-btn" @click="copyAiPayload('weekly')">
              Copy Payload
            </button>
          </div>
        </div>

        <div v-if="weeklyReport.totalMinutes === 0" class="empty-state small">
          <strong>No tracked time this week</strong>
          <span>Your weekly report will appear after you add time blocks.</span>
        </div>

        <div v-else class="report-content">
          <VueApexCharts
            type="donut"
            height="250"
            :options="weeklyChartOptions"
            :series="weeklyChartSeries"
          />

          <div class="ai-advice">
            <strong>AI Coach Draft</strong>
            <p>{{ weeklyAiAdvice }}</p>
          </div>

          <div v-if="generatedWeeklyAiReport" class="generated-report">
            <strong>Generated Weekly Report</strong>
            <pre>{{ generatedWeeklyAiReport }}</pre>
          </div>
        </div>
      </div>
    </section>

    <section class="ai-chat-card">
      <div class="report-header">
        <div>
          <h2>Ask AI Coach</h2>
          <p>Ask about your schedule, study consistency, work pressure, and growth direction.</p>
        </div>

        <span class="ai-mode-pill">
          {{ AI_ENDPOINT ? "Gemini endpoint ready" : "Local free mode" }}
        </span>
      </div>

      <div class="chat-list" v-if="aiChatMessages.length">
        <div
          v-for="(message, index) in aiChatMessages"
          :key="index"
          class="chat-message"
          :class="message.role"
        >
          <strong>{{ message.role === "user" ? "You" : "AI Coach" }}</strong>
          <pre>{{ message.text }}</pre>
        </div>
      </div>

      <div v-else class="empty-state small">
        <strong>No questions yet</strong>
        <span>Try: “我这周为什么很忙但学习时间不够？”</span>
      </div>

      <div v-if="aiError" class="error-box">
        {{ aiError }}
      </div>

      <div class="ai-input-row">
        <input
          v-model="aiQuestion"
          placeholder="Ask: 我这周时间分配合理吗？下周怎么安排 CCL / PM / Teaching？"
          @keydown.enter="askAiCoach"
        />
        <button class="save-btn" :disabled="aiLoading" @click="askAiCoach">
          {{ aiLoading ? "Thinking..." : "Ask" }}
        </button>
      </div>
    </section>

    <div v-if="showEventForm" class="modal-backdrop">
      <div class="event-modal">
        <div class="modal-header">
          <div>
            <span>New Event</span>
            <h2>Add something to your day</h2>
            <p v-if="copiedEventTemplate">
              Copied: {{ copiedEventLabel }}
            </p>
          </div>

          <div class="modal-header-actions">
            <button
              v-if="copiedEventTemplate"
              class="copy-btn"
              @click="pasteTemplateToNewEvent"
            >
              Paste
            </button>
            <button class="close-btn" @click="showEventForm = false">×</button>
          </div>
        </div>

        <div class="form-grid">
          <label class="field full">
            <span>Title</span>
            <input
              v-model="newEvent.title"
              placeholder="e.g. HerbsMotion front desk / CCL practice / Sleep"
            />
          </label>

          <label class="field">
            <span>Category</span>
            <select v-model="newEvent.categoryId">
              <option
                v-for="category in categories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.icon }} {{ category.label }} · {{ category.zh }}
              </option>
            </select>
          </label>

          <div class="field">
            <span>Category Settings</span>
            <button
              class="category-manage-btn"
              @click="openCategoryManager('new')"
            >
              Manage Categories
            </button>
          </div>

          <label class="field">
            <span>Date</span>
            <input v-model="newEvent.date" type="date" />
          </label>

          <label class="field">
            <span>Start</span>
            <input v-model="newEvent.startTime" type="time" />
          </label>

          <label class="field">
            <span>End</span>
            <input v-model="newEvent.endTime" type="time" />
          </label>

          <label class="field full">
            <span>Notes</span>
            <textarea
              v-model="newEvent.notes"
              rows="3"
              placeholder="e.g. What should I do? What should I prepare?"
            />
          </label>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="showEventForm = false">
            Cancel
          </button>
          <button class="save-btn" @click="addEvent">Save Event</button>
        </div>
      </div>
    </div>

    <div v-if="showEventDetail && selectedEvent" class="modal-backdrop">
      <div class="event-modal">
        <div class="modal-header">
          <div>
            <span>Event Detail</span>
            <h2>Edit your event</h2>
            <p v-if="copiedEventTemplate">
              Copied: {{ copiedEventLabel }}
            </p>
          </div>

          <div class="modal-header-actions">
            <button class="copy-btn" @click="copyEventTemplate(selectedEvent)">
              Copy
            </button>
            <button
              v-if="copiedEventTemplate"
              class="copy-btn"
              @click="pasteTemplateToSelectedEvent"
            >
              Paste
            </button>
            <button class="close-btn" @click="showEventDetail = false">×</button>
          </div>
        </div>

        <div class="form-grid">
          <label class="field full">
            <span>Title</span>
            <input
              v-model="selectedEvent.title"
              placeholder="e.g. SEO presentation / CCL study / Supermarket shift"
            />
          </label>

          <label class="field">
            <span>Category</span>
            <select v-model="selectedEvent.categoryId">
              <option
                v-for="category in categories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.icon }} {{ category.label }} · {{ category.zh }}
              </option>
            </select>
          </label>

          <div class="field">
            <span>Category Settings</span>
            <button
              class="category-manage-btn"
              @click="openCategoryManager('detail')"
            >
              Manage Categories
            </button>
          </div>

          <label class="field">
            <span>Status</span>
            <select v-model="selectedEvent.status">
              <option value="planned">Planned</option>
              <option value="done">Done</option>
            </select>
          </label>

          <label class="field">
            <span>Date</span>
            <input v-model="selectedEvent.date" type="date" />
          </label>

          <label class="field">
            <span>Start</span>
            <input v-model="selectedEvent.startTime" type="time" />
          </label>

          <label class="field">
            <span>End</span>
            <input v-model="selectedEvent.endTime" type="time" />
          </label>

          <label class="field full">
            <span>Notes / What should I do?</span>
            <textarea
              v-model="selectedEvent.notes"
              rows="4"
              placeholder="e.g. Person to contact, meeting goal, follow-up things..."
            />
          </label>
        </div>

        <div class="quick-actions">
          <button class="copy-btn" @click="duplicateEventToTomorrow(selectedEvent)">
            + Tomorrow
          </button>
          <button class="copy-btn" @click="duplicateEventToNextWeek(selectedEvent)">
            + Next Week
          </button>
          <button class="copy-btn" @click="duplicateEventToSelectedDate(selectedEvent)">
            + Selected Date
          </button>
          <button class="copy-btn" @click="toggleDone(selectedEvent)">
            {{ selectedEvent.status === "done" ? "Mark Planned" : "Mark Done" }}
          </button>
        </div>

        <div class="modal-actions split">
          <button class="delete-btn" @click="removeEvent(selectedEvent.id)">
            Delete
          </button>

          <div>
            <button class="cancel-btn" @click="showEventDetail = false">
              Cancel
            </button>
            <button class="save-btn" @click="saveEventDetail">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>


    <div v-if="showReflectionModal && reflectionEvent" class="modal-backdrop reflection-layer">
      <div class="reflection-modal">
        <div class="modal-header">
          <div>
            <span>Work Reflection · 工作复盘</span>
            <h2>{{ reflectionEvent.title }}</h2>
            <p>
              {{ reflectionEvent.date }} ·
              {{ reflectionEvent.startTime || "Anytime" }}
              <span v-if="reflectionEvent.endTime">–{{ reflectionEvent.endTime }}</span>
            </p>
          </div>

          <button class="close-btn" @click="closeReflection">×</button>
        </div>

        <div class="reflection-context">
          <strong>Original plan / 原计划</strong>
          <p>{{ reflectionEvent.notes || "No preparation notes were written for this event." }}</p>
        </div>

        <div class="reflection-form-grid">
          <label class="field full">
            <span>What happened? · 实际完成情况</span>
            <textarea
              v-model="reflectionForm.summary"
              rows="3"
              placeholder="事实性记录：做了什么、完成到什么程度、结果如何？"
            />
          </label>

          <label class="field">
            <span>Progress · 做得好的地方</span>
            <textarea
              v-model="reflectionForm.progress"
              rows="5"
              placeholder="例如：沟通更主动、完成速度提高、准备更充分……"
            />
          </label>

          <label class="field">
            <span>Shortcomings · 不足与卡点</span>
            <textarea
              v-model="reflectionForm.shortcomings"
              rows="5"
              placeholder="例如：时间控制不好、表达不清、遗漏跟进、技术不熟……"
            />
          </label>

          <label class="field">
            <span>Learning · 学到了什么</span>
            <textarea
              v-model="reflectionForm.learning"
              rows="4"
              placeholder="这份工作让你获得了什么经验或新认识？"
            />
          </label>

          <label class="field">
            <span>Next action · 下次怎么改</span>
            <textarea
              v-model="reflectionForm.nextSteps"
              rows="4"
              placeholder="写成可执行动作：下次提前 20 分钟准备检查清单……"
            />
          </label>

          <label class="field">
            <span>Mood · 状态</span>
            <select v-model="reflectionForm.mood">
              <option value="energised">Energised · 很有能量</option>
              <option value="steady">Steady · 稳定</option>
              <option value="stressed">Stressed · 有压力</option>
              <option value="tired">Tired · 疲惫</option>
              <option value="frustrated">Frustrated · 挫败</option>
            </select>
          </label>

          <label class="field">
            <span>Self-rating · 自评分</span>
            <select v-model.number="reflectionForm.rating">
              <option :value="1">1 · 很不满意</option>
              <option :value="2">2 · 需要明显改善</option>
              <option :value="3">3 · 基本完成</option>
              <option :value="4">4 · 完成得不错</option>
              <option :value="5">5 · 表现很好</option>
            </select>
          </label>
        </div>

        <div class="reflection-ai-box">
          <div class="reflection-ai-header">
            <div>
              <strong>AI Reflection Coach</strong>
              <p>
                分析你的进步、不足背后的原因，并生成下一次可执行的改进动作。
              </p>
            </div>

            <button
              class="ai-analysis-btn"
              :disabled="reflectionAiLoading"
              @click="analyzeReflection"
            >
              {{ reflectionAiLoading ? "Analysing..." : "Analyse with AI" }}
            </button>
          </div>

          <pre v-if="reflectionAiResult">{{ reflectionAiResult }}</pre>
          <div v-else class="reflection-ai-placeholder">
            先完成上面的复盘，再让 AI 分析。未配置接口时会自动使用本地分析。
          </div>
        </div>

        <div class="modal-actions split">
          <button class="cancel-btn" @click="closeReflection">Cancel</button>

          <button class="save-btn" @click="saveReflection()">
            Save Reflection
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCategoryManager" class="modal-backdrop category-layer">
      <div class="category-modal">
        <div class="modal-header">
          <div>
            <span>Category Manager</span>
            <h2>Manage categories</h2>
            <p>
              Create, edit, or delete categories for your calendar analysis.
            </p>
          </div>

          <button class="close-btn" @click="showCategoryManager = false">
            ×
          </button>
        </div>

        <div class="category-manager-grid">
          <section class="category-list-panel">
            <h3>Existing Categories</h3>

            <div class="category-list">
              <div
                v-for="category in categories"
                :key="category.id"
                class="category-row"
              >
                <div class="category-left">
                  <div
                    class="category-dot"
                    :style="{ backgroundColor: category.color }"
                  >
                    {{ category.icon }}
                  </div>

                  <div>
                    <strong>{{ category.label }} · {{ category.zh }}</strong>
                    <p>
                      {{ groupMeta[category.group]?.label || category.group }}
                      ·
                      {{ groupMeta[category.group]?.zh || "其他" }}
                    </p>
                  </div>
                </div>

                <div class="category-actions">
                  <button class="tiny-btn" @click="editCategory(category)">
                    Edit
                  </button>
                  <button
                    class="tiny-delete-btn"
                    @click="removeCategory(category)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="category-edit-panel">
            <h3>
              {{ editingCategoryId ? "Edit Category" : "New Category" }}
            </h3>

            <div class="category-form-clean">
              <label class="field">
                <span>Name</span>
                <input
                  v-model="categoryForm.label"
                  placeholder="e.g. HerbsMotion / Sleep / Entertainment"
                />
              </label>

              <label class="field">
                <span>Chinese Name</span>
                <input
                  v-model="categoryForm.zh"
                  placeholder="例如：诊所工作 / 睡眠 / 娱乐"
                />
              </label>

              <label class="field">
                <span>Icon</span>
                <input
                  v-model="categoryForm.icon"
                  placeholder="e.g. 💼 / 😴 / 🎮"
                />
              </label>

              <label class="field">
                <span>Color</span>
                <input v-model="categoryForm.color" type="color" />
              </label>

              <label class="field full">
                <span>AI Group</span>
                <select v-model="categoryForm.group">
                  <option value="work">Work · 工作</option>
                  <option value="study">Study · 学习</option>
                  <option value="health">Health · 健康</option>
                  <option value="rest">Rest · 休息</option>
                  <option value="life">Life · 生活</option>
                  <option value="social">Social · 社交</option>
                  <option value="other">Other · 其他</option>
                </select>
              </label>
            </div>

            <div class="category-form-actions">
              <button class="cancel-btn" @click="cancelEditCategory">
                Clear
              </button>
              <button class="save-btn" @click="saveCategory">
                {{ editingCategoryId ? "Save Category" : "Create Category" }}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.calendar-page {
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 900;
}

h1 {
  margin: 0;
  color: #0f172a;
  font-size: 34px;
  line-height: 1.05;
  letter-spacing: -0.8px;
}

.subtitle {
  margin: 8px 0 0;
  color: #64748b;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-chip {
  min-width: 190px;
  padding: 11px 14px;
  border-radius: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.time-chip span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.time-chip strong {
  display: block;
  margin-top: 3px;
  color: #0f172a;
  font-size: 18px;
}

.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 16px;
  padding: 13px 17px;
  font-weight: 900;
}

.primary-btn {
  background: #2563eb;
  color: white;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.22);
}

.secondary-btn {
  background: #eff6ff;
  color: #2563eb;
}

.secondary-btn:disabled,
.save-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.copy-banner {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 16px;
  border-radius: 18px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  color: #312e81;
}

.copy-banner span {
  margin-left: 6px;
}

.copy-banner-actions,
.calendar-top-actions,
.report-actions,
.modal-header-actions,
.quick-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.summary-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
}

.summary-card span {
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.summary-card strong {
  display: block;
  margin-top: 6px;
  color: #0f172a;
  font-size: 30px;
  line-height: 1;
}

.summary-card p {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 13px;
}

.calendar-grid {
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.left-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-card,
.calendar-card,
.report-card,
.ai-chat-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
  padding: 20px;
}

.panel-title,
.calendar-top,
.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.panel-title h2,
.calendar-top h2,
.report-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 21px;
}

.panel-title p,
.calendar-top p,
.report-header p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
}

.empty-state.small {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  color: #64748b;
}

.empty-state strong {
  color: #0f172a;
}

.event-list,
.upcoming-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-item {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  border-radius: 18px;
  padding: 10px;
  background: #f8fafc;
  color: #0f172a;
}

.event-item.done {
  opacity: 0.55;
}

.event-main,
.upcoming-item {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: none;
  border-radius: 14px;
  padding: 0;
  background: transparent;
  color: #0f172a;
}

.event-item:hover,
.upcoming-item:hover {
  background: #eff6ff;
}

.upcoming-item {
  padding: 12px;
  background: #f8fafc;
  border-radius: 18px;
}

.event-icon {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.event-body {
  flex: 1;
  min-width: 0;
}

.event-title-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.event-title-row h3 {
  margin: 0;
  font-size: 15px;
  color: #0f172a;
}

.event-title-row span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 900;
}

.event-body p {
  margin: 5px 0 0;
  color: #475569;
  font-size: 13px;
}

.event-body small {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
}

.mini-status-btn {
  border: none;
  border-radius: 12px;
  padding: 8px 10px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 900;
}

.upcoming-date {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.upcoming-date strong {
  font-size: 18px;
  color: #0f172a;
  line-height: 1;
}

.upcoming-date span {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.upcoming-main h3 {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
}

.upcoming-main p {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 12px;
}

.selected-chip,
.ai-mode-pill {
  padding: 9px 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 13px;
  font-weight: 900;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.report-content {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.ai-advice {
  border-radius: 18px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.ai-advice strong {
  color: #2563eb;
}

.ai-advice p {
  margin: 8px 0 0;
  color: #334155;
  line-height: 1.65;
}

.generated-report {
  grid-column: 1 / -1;
  border-radius: 18px;
  padding: 16px;
  background: #0f172a;
  color: #e5e7eb;
}

.generated-report strong {
  color: white;
}

.generated-report pre,
.chat-message pre {
  white-space: pre-wrap;
  margin: 10px 0 0;
  font-family: inherit;
  line-height: 1.65;
}

.ai-chat-card {
  margin-top: 18px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  border-radius: 18px;
  padding: 14px;
  border: 1px solid #e2e8f0;
}

.chat-message.user {
  background: #eff6ff;
}

.chat-message.assistant {
  background: #f8fafc;
}

.ai-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 14px;
}

.error-box {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: #fef2f2;
  color: #991b1b;
  font-weight: 800;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
}

.category-layer {
  z-index: 1100;
}

.event-modal,
.category-modal {
  width: min(760px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  border-radius: 26px;
  padding: 24px;
  background: white;
  box-shadow: 0 35px 80px rgba(15, 23, 42, 0.25);
}

.category-modal {
  width: min(980px, 100%);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.modal-header span {
  color: #2563eb;
  font-weight: 900;
  font-size: 13px;
}

.modal-header h2 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 25px;
}

.modal-header p {
  margin: 6px 0 0;
  color: #64748b;
}

.close-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 14px;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field.full {
  grid-column: 1 / -1;
}

.field span {
  color: #334155;
  font-size: 13px;
  font-weight: 900;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 12px 13px;
  outline: none;
  background: white;
  color: #0f172a;
  font-size: 14px;
}

input:focus,
select:focus,
textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.category-manage-btn,
.copy-btn,
.ghost-btn {
  border: none;
  border-radius: 14px;
  padding: 10px 13px;
  font-weight: 900;
}

.category-manage-btn,
.copy-btn {
  background: #eff6ff;
  color: #2563eb;
}

.copy-btn:hover {
  background: #dbeafe;
}

.ghost-btn {
  background: #f1f5f9;
  color: #0f172a;
}

.quick-actions {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.modal-actions.split {
  justify-content: space-between;
}

.cancel-btn,
.save-btn,
.delete-btn {
  border: none;
  border-radius: 14px;
  padding: 11px 16px;
  font-weight: 900;
}

.cancel-btn {
  background: #f1f5f9;
  color: #0f172a;
}

.save-btn {
  background: #2563eb;
  color: white;
}

.delete-btn {
  background: #fee2e2;
  color: #991b1b;
}

.category-manager-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
  gap: 18px;
}

.category-list-panel,
.category-edit-panel {
  padding: 18px;
  border-radius: 22px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.category-list-panel h3,
.category-edit-panel h3 {
  margin: 0 0 14px;
  color: #0f172a;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 430px;
  overflow-y: auto;
}

.category-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  background: white;
  border: 1px solid #e2e8f0;
}

.category-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.category-left strong {
  color: #0f172a;
  font-size: 14px;
}

.category-left p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
}

.category-dot {
  width: 42px;
  height: 42px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.category-actions {
  display: flex;
  gap: 7px;
  flex-shrink: 0;
}

.tiny-btn,
.tiny-delete-btn {
  border: none;
  border-radius: 10px;
  padding: 7px 9px;
  font-weight: 800;
  font-size: 12px;
}

.tiny-btn {
  background: #eff6ff;
  color: #2563eb;
}

.tiny-delete-btn {
  background: #fee2e2;
  color: #991b1b;
}

.category-form-clean {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.category-form-clean .field.full {
  grid-column: 1 / -1;
}

.category-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}


.collapse-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 12px;
  padding: 8px 10px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}

.collapse-btn span {
  display: inline-block;
  transition: transform 0.2s ease;
}

.collapse-btn span.rotated {
  transform: rotate(180deg);
}

.reflection-section {
  margin-top: 18px;
  padding: 22px;
  border: 1px solid #dbeafe;
  border-radius: 26px;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 34%),
    white;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.reflection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.reflection-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
}

.reflection-header > div > p:last-child {
  margin: 7px 0 0;
  color: #64748b;
}

.reflection-progress {
  min-width: 145px;
  padding: 13px 15px;
  border-radius: 18px;
  background: #eff6ff;
  text-align: right;
}

.reflection-progress strong {
  display: block;
  color: #2563eb;
  font-size: 22px;
}

.reflection-progress span {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.reflection-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.reflection-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  min-height: 190px;
  padding: 17px;
  border: 1px solid #e2e8f0;
  border-radius: 21px;
  background: #f8fafc;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.reflection-card:hover {
  transform: translateY(-2px);
  border-color: #bfdbfe;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.08);
}

.reflection-card.completed {
  background: linear-gradient(145deg, #f0fdf4, #ffffff);
  border-color: #bbf7d0;
}

.reflection-card-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.reflection-event-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  flex-shrink: 0;
  font-size: 20px;
}

.reflection-card-main {
  flex: 1;
  min-width: 0;
}

.reflection-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.reflection-title-row h3 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
}

.reflection-done,
.reflection-pending {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 900;
}

.reflection-done {
  background: #dcfce7;
  color: #166534;
}

.reflection-pending {
  background: #fef3c7;
  color: #92400e;
}

.reflection-card-main p {
  margin: 7px 0 0;
  color: #64748b;
  font-size: 12px;
}

.reflection-card-main small {
  display: -webkit-box;
  margin-top: 10px;
  overflow: hidden;
  color: #475569;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.reflection-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.reflection-rating span {
  display: block;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.reflection-rating strong {
  color: #0f172a;
  font-size: 14px;
}

.reflection-open-btn,
.ai-analysis-btn {
  border: none;
  border-radius: 13px;
  padding: 10px 13px;
  font-weight: 900;
}

.reflection-open-btn {
  background: #0f172a;
  color: white;
}

.reflection-layer {
  z-index: 1050;
}

.reflection-modal {
  width: min(900px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  border-radius: 27px;
  padding: 24px;
  background: white;
  box-shadow: 0 35px 80px rgba(15, 23, 42, 0.25);
}

.reflection-context {
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid #dbeafe;
  border-radius: 17px;
  background: #eff6ff;
}

.reflection-context strong {
  color: #1d4ed8;
}

.reflection-context p {
  margin: 6px 0 0;
  color: #334155;
  line-height: 1.55;
}

.reflection-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.reflection-ai-box {
  margin-top: 18px;
  padding: 17px;
  border-radius: 20px;
  background: #0f172a;
  color: #e2e8f0;
}

.reflection-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.reflection-ai-header strong {
  color: white;
  font-size: 16px;
}

.reflection-ai-header p {
  margin: 5px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.ai-analysis-btn {
  flex-shrink: 0;
  background: #22c55e;
  color: #052e16;
}

.ai-analysis-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.reflection-ai-box pre {
  margin: 16px 0 0;
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.7;
}

.reflection-ai-placeholder {
  margin-top: 14px;
  padding: 13px;
  border: 1px dashed #475569;
  border-radius: 14px;
  color: #94a3b8;
  font-size: 13px;
}

/* FullCalendar style */
:deep(.fc) {
  --fc-border-color: #e2e8f0;
  --fc-today-bg-color: #eff6ff;
  --fc-now-indicator-color: #ef4444;
  color: #0f172a;
}

:deep(.fc .fc-toolbar.fc-header-toolbar) {
  margin-bottom: 14px;
}

:deep(.fc .fc-toolbar-title) {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.4px;
}

:deep(.fc .fc-button) {
  border: none;
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 800;
  box-shadow: none;
}

:deep(.fc .fc-button-primary) {
  background: #f1f5f9;
  color: #0f172a;
}

:deep(.fc .fc-button-primary:hover) {
  background: #e2e8f0;
  color: #0f172a;
}

:deep(.fc .fc-button-primary:not(:disabled).fc-button-active) {
  background: #2563eb;
  color: white;
}

:deep(.fc .fc-col-header-cell) {
  background: #f8fafc;
  padding: 8px 0;
}

:deep(.fc .fc-col-header-cell-cushion),
:deep(.fc .fc-daygrid-day-number) {
  color: #475569;
  font-weight: 900;
  text-decoration: none;
}

:deep(.fc .fc-timegrid-slot-label) {
  color: #94a3b8;
  font-size: 12px;
}

:deep(.fc .fc-event) {
  border: none;
  border-radius: 10px;
  padding: 2px 5px;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}

:deep(.fc .fc-scrollgrid) {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

@media (max-width: 1180px) {
  .calendar-grid,
  .report-grid,
  .category-manager-grid {
    grid-template-columns: 1fr;
  }

  .left-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .page-header,
  .header-actions,
  .calendar-top,
  .report-header,
  .modal-header,
  .reflection-header,
  .reflection-ai-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-grid,
  .left-panel,
  .form-grid,
  .category-form-clean,
  .report-content,
  .ai-input-row {
    grid-template-columns: 1fr;
  }

  .modal-actions.split {
    flex-direction: column;
    align-items: stretch;
  }

  .copy-banner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
