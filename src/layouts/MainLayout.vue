<script setup>
import { ref } from "vue";
import { RouterLink, RouterView } from "vue-router";

const collapsed = ref(false);

const navItems = [
  { path: "/calendar", label: "Calendar", zh: "日历", icon: "📅" },
  { path: "/workspaces", label: "Workspaces", zh: "工作区", icon: "🗂️" },
  { path: "/tasks", label: "Tasks", zh: "任务", icon: "✅" },
  { path: "/time-tracker", label: "Time Tracker", zh: "时间记录", icon: "⏱️" },
  { path: "/learning-log", label: "Learning Log", zh: "学习日志", icon: "📚" },
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
  { path: "/ai-coach", label: "AI Coach", zh: "AI 教练", icon: "🤖" },
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

        <button class="collapse-btn" @click="collapsed = !collapsed">
          {{ collapsed ? "→" : "←" }}
        </button>
      </div>

      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :title="collapsed ? item.label : ''"
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
  transition: width 0.22s ease;
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

.brand-text h2 {
  margin: 0;
  font-size: 22px;
  color: white;
  line-height: 1.1;
}

.brand-text p {
  margin: 5px 0 0;
  font-size: 12px;
  color: #cbd5e1;
}

.collapse-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: #1e293b;
  color: #e5e7eb;
  font-weight: 900;
}

.app-layout.collapsed .collapse-btn {
  margin-left: auto;
  margin-right: auto;
  margin-top: 12px;
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
  transition: 0.18s;
}

.app-layout.collapsed .nav-item {
  justify-content: center;
  padding: 13px 0;
}

.nav-item:hover,
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
</style>
