/* =====================================================
   LEADFLOW — LEAD MANAGEMENT DASHBOARD
   JavaScript | Version 1.0
   Compatible with index.html + style.css
   ===================================================== */

"use strict";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const CONFIG = {
    appName: "LeadFlow",
    storageKey: "leadflow_data_v1",
    webhookTimeout: 60000,
    allowedTitles: [
        "CEO",
        "Founder",
        "Co-Founder",
        "Chairman",
        "Co-Chairman"
    ]
};

// ==========================================
// 2. APPLICATION STATE
// ==========================================

const state = {
    leads: [],
    activities: [],
    collections: 0,
    isRunning: false,
    searchTerm: ""
};

// ==========================================
// 3. DOM ELEMENTS
// ==========================================

const $ = (selector) => document.querySelector(selector);

const elements = {
    pages: document.querySelectorAll(".page"),
    navLinks: document.querySelectorAll(".nav-link"),
    navigationButtons: document.querySelectorAll("[data-navigate]"),

    totalLeads: $("#totalLeads"),
    qualifiedLeads: $("#qualifiedLeads"),
    totalCollections: $("#totalCollections"),
    systemStatus: $("#systemStatus"),

    activityList: $("#activityList"),

    dataSource: $("#dataSource"),
    webhookUrl: $("#webhookUrl"),
    csvFile: $("#csvFile"),

    apiSettings: $("#apiSettings"),
    csvSettings: $("#csvSettings"),

    startAutomation: $("#startAutomation"),
    collectionMessage: $("#collectionMessage"),

    progressText: $("#progressText"),
    progressPercentage: $("#progressPercentage"),
    progressBar: $("#progressBar"),

    leadsTableBody: $("#leadsTableBody"),
    leadSearch: $("#leadSearch"),
    leadCount: $("#leadCount"),
    exportLeads: $("#exportLeads"),

    linkedinStatus: $("#linkedinStatus"),
    sheetsStatus: $("#sheetsStatus"),
    n8nStatus: $("#n8nStatus")
};

// ==========================================
// 4. LOCAL DATA STORAGE
// ==========================================

function saveState() {
    try {
        localStorage.setItem(
            CONFIG.storageKey,
            JSON.stringify({
                leads: state.leads,
                activities: state.activities,
                collections: state.collections
            })
        );
    } catch (error) {
        console.error("Storage error:", error);
        showMessage(
            "Browser storage is unavailable. Your current data may not persist after closing the page.",
            "error"
        );
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(CONFIG.storageKey);

        if (!saved) return;

        const data = JSON.parse(saved);

        state.leads = Array.isArray(data.leads) ? data.leads : [];
        state.activities = Array.isArray(data.activities)
            ? data.activities
            : [];

        state.collections = Number(data.collections) || 0;

    } catch (error) {
        console.error("Unable to load saved data:", error);
    }
}

// ==========================================
// 5. PAGE NAVIGATION
// ==========================================

function navigateTo(pageId) {
    const target = document.getElementById(pageId);

    if (!target || !target.classList.contains("page")) {
        return;
    }

    elements.pages.forEach(page => {
        page.classList.toggle("active", page.id === pageId);
    });

    elements.navLinks.forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === pageId
        );
    });

    window.location.hash = pageId;
}

function initializeNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    elements.navigationButtons.forEach(button => {
        button.addEventListener("click", () => {
            navigateTo(button.dataset.navigate);
        });
    });

    const initialPage = window.location.hash.replace("#", "");

    navigateTo(
        document.getElementById(initialPage)?.classList.contains("page")
            ? initialPage
            : "dashboard"
    );
}

// ==========================================
// 6. MESSAGE SYSTEM
// ==========================================

function showMessage(message, type = "info") {
    const box = elements.collectionMessage;

    box.textContent = message;
    box.className = `message ${type}`;
}

function clearMessage() {
    elements.collectionMessage.textContent = "";
    elements.collectionMessage.className = "message hidden";
}

// ==========================================
// 7. PROGRESS SYSTEM
// ==========================================

function updateProgress(percent, message) {
    const value = Math.max(0, Math.min(100, percent));

    elements.progressBar.style.width = `${value}%`;
    elements.progressPercentage.textContent = `${value}%`;
    elements.progressText.textContent = message;
}

// ==========================================
// 8. TITLE FILTERING
// ==========================================

function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function getSelectedDesignations() {
    return Array.from(
        document.querySelectorAll(
            'input[name="designation"]:checked'
        )
    ).map(input => input.value);
}

function matchesDesignation(title, selected) {
    const normalized = normalizeText(title);

    if (!normalized) return false;

    const rules = {
        "CEO": /\b(ceo|chief executive officer)\b/i,
        "Founder": /\bfounder\b/i,
        "Co-Founder": /\bco[ -]?founder\b/i,
        "Chairman": /\bchairman\b/i,
        "Co-Chairman": /\bco[ -]?chairman\b/i
    };

    return selected.some(designation => {
        const rule = rules[designation];

        return rule ? rule.test(normalized) : false;
    });
}

// ==========================================
// 9. CSV PARSER
// Handles quoted fields and commas
// ==========================================

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && insideQuotes && next === '"') {
            field += '"';
            i++;
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
            row.push(field);
            field = "";
        } else if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {
            if (char === "\r" && next === "\n") i++;

            row.push(field);
            rows.push(row);

            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    if (rows.length < 2) {
        throw new Error("CSV file is empty or has no profile records.");
    }

    const headers = rows[0].map(header =>
        normalizeText(header).replace(/^\uFEFF/, "")
    );

    return rows.slice(1)
        .filter(values => values.some(value => value.trim()))
        .map(values => {
            const record = {};

            headers.forEach((header, index) => {
                record[header] = values[index]?.trim() ?? "";
            });

            return record;
        });
}

// ==========================================
// 10. CSV COLUMN MAPPING
// ==========================================

function getField(record, possibleNames) {
    for (const name of possibleNames) {
        const value = record[normalizeText(name)];

        if (value !== undefined && value !== "") {
            return value;
        }
    }

    return "";
}

function normalizeProfile(record) {
    return {
        fullName: getField(record, [
            "full name",
            "name",
            "fullname",
            "first name"
        ]),

        currentTitle: getField(record, [
            "current title",
            "title",
            "headline",
            "job title",
            "position"
        ]),

        company: getField(record, [
            "company",
            "current company",
            "organization"
        ]),

        linkedinUrl: getField(record, [
            "linkedin url",
            "linkedin profile",
            "profile url",
            "url"
        ]),

        location: getField(record, [
            "location",
            "city",
            "country"
        ])
    };
}

// ==========================================
// 11. DUPLICATE DETECTION
// ==========================================

function getLeadIdentity(lead) {
    const url = normalizeText(lead.linkedinUrl);

    if (url) return url.replace(/\/+$/, "");

    return [
        normalizeText(lead.fullName),
        normalizeText(lead.company)
    ].join("|");
}

function removeDuplicates(leads) {
    const seen = new Set();

    return leads.filter(lead => {
        const identity = getLeadIdentity(lead);

        if (!identity || identity === "|") return false;

        if (seen.has(identity)) return false;

        seen.add(identity);
        return true;
    });
}

// ==========================================
// 12. ACTIVITY LOG
// ==========================================

function addActivity(message, type = "info") {
    state.activities.unshift({
        message,
        type,
        date: new Date().toISOString()
    });

    state.activities = state.activities.slice(0, 20);

    saveState();
    renderActivities();
}

function renderActivities() {
    if (!state.activities.length) {
        elements.activityList.className = "empty-state";

        elements.activityList.innerHTML = `
            <div class="empty-icon">◷</div>
            <h3>No activity yet</h3>
            <p>Your collection history will appear here.</p>
        `;

        return;
    }

    elements.activityList.className = "activity-list";
    elements.activityList.replaceChildren();

    state.activities.forEach(activity => {
        const item = document.createElement("div");
        item.className = "activity-item";

        const title = document.createElement("strong");
        title.textContent = activity.message;

        const date = document.createElement("small");
        date.textContent = new Date(
            activity.date
        ).toLocaleString();

        item.append(title, date);
        elements.activityList.appendChild(item);
    });
}

// ==========================================
// 13. DASHBOARD STATISTICS
// ==========================================

function updateDashboard() {
    elements.totalLeads.textContent = state.leads.length;

    elements.qualifiedLeads.textContent = state.leads.length;

    elements.totalCollections.textContent = state.collections;

    elements.systemStatus.textContent = state.isRunning
        ? "Running"
        : "Ready";

    renderLeads();
    renderActivities();
}

// ==========================================
// 14. LEADS TABLE
// ==========================================

function renderLeads() {
    const search = normalizeText(state.searchTerm);

    const filtered = state.leads.filter(lead => {
        const searchable = [
            lead.fullName,
            lead.currentTitle,
            lead.company,
            lead.location,
            lead.linkedinUrl
        ].join(" ").toLowerCase();

        return searchable.includes(search);
    });

    elements.leadsTableBody.replaceChildren();

    elements.leadCount.textContent =
        `${filtered.length} records`;

    if (!filtered.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className = "table-empty";
        cell.textContent = "No matching leads found.";

        row.appendChild(cell);
        elements.leadsTableBody.appendChild(row);

        return;
    }

    filtered.forEach(lead => {
        const row = document.createElement("tr");

        const values = [
            lead.fullName,
            lead.currentTitle,
            lead.company,
            lead.location
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value || "—";
            row.appendChild(cell);
        });

        const linkCell = document.createElement("td");

        if (
            lead.linkedinUrl &&
            /^https:\/\/(www\.)?linkedin\.com\//i.test(
                lead.linkedinUrl
            )
        ) {
            const link = document.createElement("a");

            link.href = lead.linkedinUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "View Profile";
            link.style.color = "#2457A7";

            linkCell.appendChild(link);
        } else {
            linkCell.textContent = "—";
        }

        row.appendChild(linkCell);
        elements.leadsTableBody.appendChild(row);
    });
}

// ==========================================
// 15. CSV FILE READING
// ==========================================

async function readCSVFile(file) {
    if (!file) {
        throw new Error("Please select a CSV file.");
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Only CSV files are supported.");
    }

    if (file.size > 10 * 1024 * 1024) {
        throw new Error("CSV file must be smaller than 10 MB.");
    }

    const text = await file.text();

    const parsed = parseCSV(text);

    return parsed.map(normalizeProfile);
}

// ==========================================
// 16. WEBHOOK REQUEST
// ==========================================

async function sendToWebhook(url, records, designations) {
    let parsedUrl;

    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error("Please enter a valid n8n webhook URL.");
    }

    if (parsedUrl.protocol !== "https:") {
        throw new Error("Use a secure HTTPS webhook URL.");
    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.webhookTimeout
    );

    try {
        const response = await fetch(parsedUrl.toString(), {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                source: "leadflow-dashboard",
                records,
                designations,
                requestedAt: new Date().toISOString()
            }),

            signal: controller.signal
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(
                `n8n returned HTTP ${response.status}. ${responseText.slice(0, 250)}`
            );
        }

        return responseText;

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Webhook request timed out.");
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ==========================================
// 17. COLLECTION PROCESS
// ==========================================

async function startCollection() {
    if (state.isRunning) return;

    clearMessage();

    const designations = getSelectedDesignations();

    if (!designations.length) {
        showMessage(
            "Please select at least one leadership designation.",
            "error"
        );
        return;
    }

    const source = elements.dataSource.value;
    const webhookUrl = elements.webhookUrl.value.trim();

    if (!webhookUrl) {
        showMessage(
            "Please configure your n8n production webhook URL first.",
            "error"
        );
        return;
    }

    state.isRunning = true;
    elements.startAutomation.disabled = true;
    elements.startAutomation.textContent = "Processing...";

    updateDashboard();
    updateProgress(10, "Preparing collection...");

    try {
        let records = [];

        // CSV SOURCE

        if (source === "csv") {
            const file = elements.csvFile.files[0];

            updateProgress(25, "Reading CSV file...");

            records = await readCSVFile(file);

            updateProgress(40, "Preparing profile records...");
        }

        // API SOURCE

        else {
            throw new Error(
                "Authorized API integration is not configured yet. We will connect the provider in the n8n backend setup."
            );
        }

        // Validate data

        records = records.filter(record =>
            record.fullName ||
            record.currentTitle ||
            record.linkedinUrl
        );

        if (!records.length) {
            throw new Error("No valid profile records found in this file.");
        }

        // Filter matching designations

        const qualified = records.filter(profile =>
            matchesDesignation(
                profile.currentTitle,
                designations
            )
        );

        if (!qualified.length) {
            throw new Error(
                "No profiles matched the selected leadership designations."
            );
        }

        updateProgress(65, "Sending qualified profiles to n8n...");

        // Send to n8n

        await sendToWebhook(
            webhookUrl,
            qualified,
            designations
        );

        updateProgress(90, "Updating dashboard...");

        // Store only successfully submitted leads

        const existingIds = new Set(
            state.leads.map(getLeadIdentity)
        );

        const newLeads = removeDuplicates(qualified)
            .filter(lead => !existingIds.has(getLeadIdentity(lead)))
            .map(lead => ({
                ...lead,
                capturedAt: new Date().toISOString()
            }));

        state.leads.push(...newLeads);

        state.collections++;

        saveState();
        updateDashboard();

        addActivity(
            `${newLeads.length} new qualified profiles submitted to n8n.`,
            "success"
        );

        updateProgress(100, "Collection request completed.");

        showMessage(
            `${newLeads.length} new matching profiles submitted to n8n. Check your Google Sheets workflow execution for the final save result.`,
            "success"
        );

    } catch (error) {
        console.error("Collection error:", error);

        updateProgress(0, "Collection failed.");

        showMessage(error.message, "error");

        addActivity(
            `Collection failed: ${error.message}`,
            "error"
        );

    } finally {
        state.isRunning = false;

        elements.startAutomation.disabled = false;
        elements.startAutomation.textContent = "▶ Start Automation";

        updateDashboard();
    }
}

// ==========================================
// 18. DATA SOURCE SWITCHING
// ==========================================

function initializeDataSource() {
    elements.dataSource.addEventListener("change", () => {
        const isCSV = elements.dataSource.value === "csv";

        elements.csvSettings.classList.toggle(
            "hidden",
            !isCSV
        );

        elements.apiSettings.classList.toggle(
            "hidden",
            isCSV
        );

        clearMessage();
    });
}

// ==========================================
// 19. SEARCH
// ==========================================

function initializeSearch() {
    elements.leadSearch.addEventListener("input", event => {
        state.searchTerm = event.target.value;
        renderLeads();
    });
}
