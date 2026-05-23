(function () {
  const config = window.TREASURE_CONFIG;

  class TreasureApi {
    constructor() {
      this.session = JSON.parse(localStorage.getItem("ti_session") || "null");
    }

    isLive() {
      return Boolean(config.apiUrl && config.apiUrl.startsWith("http"));
    }

    setSession(session) {
      this.session = session;
      localStorage.setItem("ti_session", JSON.stringify(session));
    }

    clearSession() {
      this.session = null;
      localStorage.removeItem("ti_session");
    }

    async request(action, payload = {}) {
      if (!this.isLive()) {
        return this.demo(action, payload);
      }

      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action,
          token: this.session?.token || "",
          payload
        })
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "คำขอไม่สำเร็จ");
      return data.data;
    }

    async registerUser(username, password) {
      const data = await this.request("registerUser", { username, password });
      this.setSession(data);
      return data;
    }

    async loginUser(username, password) {
      const data = await this.request("loginUser", { username, password });
      this.setSession(data);
      return data;
    }

    async getScene(sceneId) {
      return this.request("getScene", { sceneId });
    }

    async getAssessmentConfig() {
      return this.request("getAssessmentConfig", {});
    }

    async saveProgress(progress) {
      return this.request("saveProgress", progress);
    }

    async getUserProgress(username) {
      return this.request("getUserProgress", { username });
    }

    async logGameplay(log) {
      return this.request("logGameplay", log);
    }

    async getGameStatistics(filters = {}) {
      return this.request("getGameStatistics", filters);
    }

    async getPlayerAnalytics(filters = {}) {
      return this.request("getPlayerAnalytics", filters);
    }

    async demo(action, payload) {
      const username = payload.username || this.session?.username || config.demoUsername;
      const progressKey = `ti_demo_progress_${username}`;
      const logsKey = "ti_demo_logs";

      if (action === "registerUser" || action === "loginUser") {
        return { username, role: username === "admin" ? "admin" : "player", token: `demo_${Date.now()}` };
      }

      if (action === "getScene") {
        return config.demoScenes[payload.sceneId || "start"];
      }

      if (action === "getAssessmentConfig") {
        return {
          totalAcMaxScore: calculateDemoTotalAcMaxScore()
        };
      }

      if (action === "saveProgress") {
        const current = JSON.parse(localStorage.getItem(progressKey) || "{}");
        const saved = { ...payload, username, version: (current.version || 0) + 1, save_time: new Date().toISOString() };
        localStorage.setItem(progressKey, JSON.stringify(saved));
        return saved;
      }

      if (action === "getUserProgress") {
        return JSON.parse(localStorage.getItem(progressKey) || "null");
      }

      if (action === "logGameplay") {
        const logs = JSON.parse(localStorage.getItem(logsKey) || "[]");
        logs.push({ ...payload, username, timestamp: new Date().toISOString() });
        localStorage.setItem(logsKey, JSON.stringify(logs));
        return { logged: true };
      }

      if (action === "getGameStatistics" || action === "getPlayerAnalytics") {
        const logs = JSON.parse(localStorage.getItem(logsKey) || "[]");
        const progress = Object.keys(localStorage)
          .filter((key) => key.startsWith("ti_demo_progress_"))
          .map((key) => JSON.parse(localStorage.getItem(key)));
        return buildDemoAnalytics(logs, progress);
      }

      return {};
    }
  }

  function buildDemoAnalytics(logs, progress) {
    const players = new Set(progress.map((row) => row.username));
    const scoredLogs = logs.filter((row) => row.scene_type !== "NAR");
    const avg = (key) => scoredLogs.length
      ? scoredLogs.reduce((sum, row) => sum + Number(row[key] || 0), 0) / scoredLogs.length
      : 0;
    const byScene = {};
    const byChoice = {};
    logs.forEach((row) => {
      byScene[row.scene_id] ||= { scene_id: row.scene_id, attempts: 0, avgAC: 0, totalAC: 0 };
      byScene[row.scene_id].attempts += 1;
      byScene[row.scene_id].totalAC += Number(row.AS ?? row.AC ?? 0);
      byScene[row.scene_id].avgAC = byScene[row.scene_id].totalAC / byScene[row.scene_id].attempts;
      const choice = row.final_choice || row.first_choice || "none";
      byChoice[choice] = (byChoice[choice] || 0) + 1;
    });
    return {
      users: progress,
      progress,
      logs,
      summary: {
        players: players.size,
        averageAC: avg("AS") || avg("AC"),
        averageMC: avg("MS") || avg("MC"),
        averageAS: avg("AS") || avg("AC"),
        averageMS: avg("MS") || avg("MC"),
        averageLPS: avg("LPS"),
        improvementRate: (avg("MS") || avg("MC")) - (avg("AS") || avg("AC")),
        mediationEffectiveness: (avg("AS") || avg("AC")) ? (((avg("MS") || avg("MC")) - (avg("AS") || avg("AC"))) / (avg("AS") || avg("AC"))) * 100 : 0
      },
      difficultScenes: Object.values(byScene).sort((a, b) => a.avgAC - b.avgAC),
      choiceStats: Object.entries(byChoice).map(([choice, count]) => ({ choice, count })),
      pathStats: logs.map((row) => ({ path: `${row.scene_id} -> ${row.final_choice || row.first_choice}`, count: 1 }))
    };
  }

  function calculateDemoTotalAcMaxScore() {
    return Object.values(config.demoScenes)
      .filter((scene) => ["CTQ", "CT2"].includes(scene.scene_type) || ["AS", "AC", "BOTH"].includes(scene.score_type))
      .reduce((sum, scene) => sum + Number(scene.max_score || config.lpsMaxScore || 0), 0);
  }

  window.TreasureApi = TreasureApi;
})();
