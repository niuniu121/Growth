import { createRouter, createWebHistory } from "vue-router";

import MainLayout from "../layouts/MainLayout.vue";

import CalendarView from "../views/CalendarView.vue";
import WorkspacesView from "../views/WorkspacesView.vue";
import TasksView from "../views/TasksView.vue";
import TimeTrackerView from "../views/TimeTrackerView.vue";
import LearningLogView from "../views/LearningLogView.vue";
import DailyReflectionView from "../views/DailyReflectionView.vue";
import WeeklyReviewView from "../views/WeeklyReviewView.vue";
import AiCoachView from "../views/AiCoachView.vue";
import SettingsView from "../views/SettingsView.vue";

const routes = [
    {
        path: "/",
        component: MainLayout,
        redirect: "/calendar",
        children: [
            {
                path: "calendar",
                name: "Calendar",
                component: CalendarView,
            },
            {
                path: "workspaces",
                name: "Workspaces",
                component: WorkspacesView,
            },
            {
                path: "tasks",
                name: "Tasks",
                component: TasksView,
            },
            {
                path: "time-tracker",
                name: "TimeTracker",
                component: TimeTrackerView,
            },
            {
                path: "learning-log",
                name: "LearningLog",
                component: LearningLogView,
            },
            {
                path: "daily-reflection",
                name: "DailyReflection",
                component: DailyReflectionView,
            },
            {
                path: "weekly-review",
                name: "WeeklyReview",
                component: WeeklyReviewView,
            },
            {
                path: "ai-coach",
                name: "AiCoach",
                component: AiCoachView,
            },
            {
                path: "settings",
                name: "Settings",
                component: SettingsView,
            },
        ],
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;