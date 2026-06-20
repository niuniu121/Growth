<script setup>
import { ref } from "vue";
import { RouterLink, RouterView } from "vue-router";

const collapsed = ref(false);

const navItems = [
  { path: "/calendar", label: "Calendar", zh: "日历", icon: "📅" },
  { path: "/workspaces", label: "Workspaces", zh: "工作区", icon: "🗂️" },

  {
    path: "/study-hub",
    label: "Study Hub",
    zh: "学习中心",
    icon: "🧠",
  },

  { path: "/tasks", label: "Tasks", zh: "任务", icon: "✅" },
  {
    path: "/time-tracker",
    label: "Time Tracker",
    zh: "时间记录",
    icon: "⏱️",
  },
  {
    path: "/learning-log",
    label: "Learning Log",
    zh: "学习日志",
    icon: "📚",
  },
  {
    path: "/daily-reflection",
    label: "Daily Reflection",
    zh: "每日复盘",
    icon: "🌙",
  },
  {
    path: "/weekly-review",
    label: "Weekly Review",
    zh: "每周总结",
    icon: "📊",
  },
  {
    path: "/ai-coach",
    label: "AI Coach",
    zh: "AI 教练",
    icon: "🤖",
  },
];
</script>

<template>
  <div class="app-layout" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand">
          <div class="logo">G</div>

          <div v-if="!collapsed" class="brand-text">
            <h2>GrowthOS</h2>
            <p>Joy's Life System</p>
          </div>
        </div>

        <button
          type="button"
          class="collapse-btn"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="collapsed = !collapsed"
        >
          {{ collapsed ? "→" : "←" }}
        </button>
      </div>

      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :title="collapsed ? `${item.label} · ${item.zh}` : ''"
        >
          <span class="nav-icon">{{ item.icon }}</span>

          <span v-if="!collapsed" class="nav-label">
            <strong>{{ item.label }}</strong>
            <small>{{ item.zh }}</small>
          </span>
        </RouterLink>
      </nav>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  background: #f6f7fb;
}

.sidebar {
  width: 272px;
  flex-shrink: 0;
  background: #0f172a;
  color: white;
  padding: 22px;
  transition:
    width 0.22s ease,
    padding 0.22s ease;
  box-sizing: border-box;
}

.app-layout.collapsed .sidebar {
  width: 88px;
  padding: 22px 16px;
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: white;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  flex-shrink: 0;
}

.brand-text {
  min-width: 0;
}

.brand-text h2 {
  margin: 0;
  font-size: 22px;
  color: white;
  line-height: 1.1;
  white-space: nowrap;
}

.brand-text p {
  margin: 5px 0 0;
  font-size: 12px;
  color: #cbd5e1;
  white-space: nowrap;
}

.collapse-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: #1e293b;
  color: #e5e7eb;
  font-weight: 900;
  cursor: pointer;
  transition: 0.18s ease;
}

.collapse-btn:hover {
  background: #334155;
  color: white;
}

.app-layout.collapsed .sidebar-top {
  flex-direction: column;
  gap: 10px;
}

.app-layout.collapsed .collapse-btn {
  margin-left: auto;
  margin-right: auto;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 15px;
  color: #cbd5e1;
  text-decoration: none;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.app-layout.collapsed .nav-item {
  justify-content: center;
  padding: 13px 0;
}

.nav-item:hover {
  background: #1e293b;
  color: white;
  transform: translateX(2px);
}

.app-layout.collapsed .nav-item:hover {
  transform: none;
}

.nav-item.router-link-active {
  background: #1e293b;
  color: white;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.nav-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nav-label strong {
  font-size: 15px;
}

.nav-label small {
  font-size: 11px;
  color: #94a3b8;
}

.nav-item.router-link-active .nav-label small {
  color: #cbd5e1;
}

.main-content {
  flex: 1;
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 24px;
  box-sizing: border-box;
}

@media (max-width: 760px) {
  .sidebar {
    width: 88px;
    padding: 18px 14px;
  }

  .sidebar-top {
    flex-direction: column;
    gap: 10px;
  }

  .brand-text {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 13px 0;
  }

  .nav-label {
    display: none;
  }

  .main-content {
    padding: 16px;
  }
}
</style>
