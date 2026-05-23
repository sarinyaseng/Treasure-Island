(function () {
  const api = new TreasureApi();
  const $ = (id) => document.getElementById(id);
  let dashboardData = null;
  let charts = {};

  $("adminLogin").addEventListener("click", async () => {
    try {
      await api.loginUser($("adminUsername").value.trim(), $("adminPassword").value);
      await loadDashboard();
      toast("เชื่อมต่อแดชบอร์ดแล้ว", "alert-success");
    } catch (error) {
      toast(error.message, "alert-error");
    }
  });

  $("refreshDashboard").addEventListener("click", loadDashboard);
  $("searchUsers").addEventListener("input", renderTables);
  $("completionFilter").addEventListener("change", renderTables);
  $("exportAll").addEventListener("click", () => exportData(dashboardData?.progress || []));
  $("exportFiltered").addEventListener("click", () => exportData(filteredProgress()));

  async function loadDashboard() {
    try {
      dashboardData = await api.getGameStatistics({});
      renderKpis();
      renderCharts();
      renderTables();
      lucide.createIcons();
    } catch (error) {
      toast(error.message, "alert-error");
    }
  }

  function renderKpis() {
    const summary = dashboardData?.summary || {};
    $("kpiPlayers").textContent = summary.players || 0;
    $("kpiAC").textContent = formatNumber(summary.averageAS ?? summary.averageAC);
    $("kpiMC").textContent = formatNumber(summary.averageMS ?? summary.averageMC);
    $("kpiLPS").textContent = formatNumber(summary.averageLPS);
    $("kpiMediation").textContent = `${formatNumber(summary.mediationEffectiveness)}%`;
  }

  function renderCharts() {
    const summary = dashboardData?.summary || {};
    drawChart("scoreChart", "bar", {
      labels: ["AS", "MS", "LPS"],
      datasets: [{ label: "คะแนนเฉลี่ย", data: [summary.averageAS ?? summary.averageAC ?? 0, summary.averageMS ?? summary.averageMC ?? 0, summary.averageLPS || 0], backgroundColor: ["#f5c542", "#14b8a6", "#86efac"] }]
    });

    const difficult = (dashboardData?.difficultScenes || []).slice(0, 8);
    drawChart("difficultyChart", "bar", {
      labels: difficult.map((row) => row.scene_id),
      datasets: [{ label: "AS เฉลี่ย", data: difficult.map((row) => row.avgAS ?? row.avgAC ?? 0), backgroundColor: "#f97316" }]
    });

    const choices = (dashboardData?.choiceStats || []).slice(0, 8);
    drawChart("choiceChart", "doughnut", {
      labels: choices.map((row) => row.choice),
      datasets: [{ data: choices.map((row) => row.count), backgroundColor: ["#f5c542", "#14b8a6", "#60a5fa", "#f472b6", "#a78bfa", "#fb7185", "#34d399", "#fde68a"] }]
    });

    const paths = aggregatePaths(dashboardData?.pathStats || []).slice(0, 8);
    drawChart("pathChart", "bar", {
      labels: paths.map((row) => row.path),
      datasets: [{ label: "จำนวนครั้ง", data: paths.map((row) => row.count), backgroundColor: "#60a5fa" }]
    });
  }

  function drawChart(id, type, data) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#e5e7eb" } } },
        scales: type === "doughnut" ? {} : {
          x: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(255,255,255,0.06)" } },
          y: { ticks: { color: "#cbd5e1" }, grid: { color: "rgba(255,255,255,0.06)" } }
        }
      }
    });
  }

  function renderProgressTable() {
    const rows = filteredProgress();
    $("progressRows").innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.username || "")}</td>
        <td>${escapeHtml(row.current_scene || "")}</td>
        <td>${formatNumber(row.total_AS ?? row.total_AC)}</td>
        <td>${formatNumber(row.total_MS ?? row.total_MC)}</td>
        <td>${formatNumber(row.total_LPS)}</td>
        <td>${escapeHtml(row.save_time || "")}</td>
        <td><span class="badge ${row.completed ? "badge-success" : "badge-warning"}">${row.completed ? "จบเกมแล้ว" : "กำลังเล่น"}</span></td>
      </tr>
    `).join("");
  }

  function renderTables() {
    renderProgressTable();
    renderIndividualSummaryTable();
    renderScoredChoiceTable();
  }

  function renderIndividualSummaryTable() {
    const rows = individualScoredSummary().filter((row) => filteredUsernames().has(row.username));
    $("individualSummaryRows").innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.username)}</td>
        <td>${row.scoredScenes}</td>
        <td>${formatNumber(row.totalAC)}</td>
        <td>${formatNumber(row.totalMC)}</td>
        <td>${formatNumber(row.lps)}</td>
        <td><span class="badge ${row.mediatedCount ? "badge-info" : "badge-ghost"}">${row.mediatedCount}</span></td>
      </tr>
    `).join("");
  }

  function renderScoredChoiceTable() {
    const usernames = filteredUsernames();
    const rows = scoredChoiceRows().filter((row) => usernames.has(row.username));
    $("scoredChoiceRows").innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.username)}</td>
        <td>${escapeHtml(row.scene_id)}</td>
        <td><span class="badge badge-outline">${escapeHtml(row.scene_type)}</span></td>
        <td>${escapeHtml(row.first_choice || "")}</td>
        <td>${escapeHtml(row.final_choice || "")}</td>
        <td>${formatNumber(row.AS ?? row.AC)}</td>
        <td>${formatNumber(row.MS ?? row.MC)}</td>
        <td>${formatNumber(row.LPS)}</td>
        <td><span class="badge ${row.mediation_used ? "badge-info" : "badge-ghost"}">${row.mediation_used ? "ใช้" : "ไม่ใช้"}</span></td>
        <td>${escapeHtml(row.timestamp || "")}</td>
      </tr>
    `).join("");
  }

  function scoredChoiceRows() {
    return (dashboardData?.logs || [])
      .filter((row) => ["CTQ", "CT2", "DAH"].includes(String(row.scene_type)))
      .map((row) => ({
        ...row,
        mediation_used: row.mediation_used === true || String(row.mediation_used).toUpperCase() === "TRUE"
      }));
  }

  function individualScoredSummary() {
    const totalAcMaxScore = Number(dashboardData?.summary?.totalAcMaxScore || 1);
    const map = {};
    scoredChoiceRows().forEach((row) => {
      map[row.username] ||= {
        username: row.username,
        scoredScenes: 0,
        totalAC: 0,
        totalMC: 0,
        mediatedCount: 0
      };
      map[row.username].scoredScenes += 1;
      map[row.username].totalAC += Number(row.AS ?? row.AC ?? 0);
      map[row.username].totalMC += Number(row.MS ?? row.MC ?? 0);
      if (row.mediation_used) map[row.username].mediatedCount += 1;
    });
    return Object.values(map).map((row) => ({
      ...row,
      lps: calculateDashboardLps(row.totalAC, row.totalMC, totalAcMaxScore)
    })).sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }

  function filteredUsernames() {
    const names = new Set(filteredProgress().map((row) => row.username));
    const query = $("searchUsers").value.trim().toLowerCase();
    if ($("completionFilter").value === "all") {
      scoredChoiceRows().forEach((row) => {
        if (!query || String(row.username || "").toLowerCase().includes(query)) {
          names.add(row.username);
        }
      });
    }
    return names;
  }

  function filteredProgress() {
    const query = $("searchUsers").value.trim().toLowerCase();
    const status = $("completionFilter").value;
    return (dashboardData?.progress || []).filter((row) => {
      const matchesQuery = !query || String(row.username || "").toLowerCase().includes(query);
      const completed = row.completed === true || String(row.completed).toUpperCase() === "TRUE";
      const matchesStatus = status === "all" || (status === "complete" && completed) || (status === "active" && !completed);
      return matchesQuery && matchesStatus;
    });
  }

  function exportData(progressRows) {
    if (!dashboardData) return toast("ยังไม่มีข้อมูลแดชบอร์ด", "alert-warning");
    const usernames = new Set(progressRows.map((row) => row.username));
    const sheets = TreasureExport.buildAnalyticsSheets(dashboardData, progressRows, {
      individualSummary: individualScoredSummary().filter((row) => usernames.has(row.username)),
      scoredChoices: scoredChoiceRows().filter((row) => usernames.has(row.username))
    });
    TreasureExport.exportWorkbook(`treasure-island-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`, sheets);
  }

  function aggregatePaths(paths) {
    const map = {};
    paths.forEach((row) => {
      map[row.path] = (map[row.path] || 0) + Number(row.count || 1);
    });
    return Object.entries(map).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);
  }

  function formatNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, "");
  }

  function calculateDashboardLps(ac, mc, totalAcMaxScore) {
    const max = Math.max(Number(totalAcMaxScore || 1), 1);
    return Number((((2 * Number(mc || 0)) - Number(ac || 0)) / max).toFixed(2));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function toast(message, type = "alert-info") {
    const alert = document.createElement("div");
    alert.className = `alert ${type}`;
    alert.textContent = message;
    $("toast").appendChild(alert);
    window.setTimeout(() => alert.remove(), 3200);
  }

  loadDashboard();
  lucide.createIcons();
})();
