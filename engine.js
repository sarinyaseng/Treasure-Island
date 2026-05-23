(function () {
  class IFEngine extends EventTarget {
    constructor(api, config) {
      super();
      this.api = api;
      this.config = config;
      this.assessmentConfig = {
        totalAcMaxScore: Number(config.totalAcMaxScore || config.lpsMaxScore || 1)
      };
      this.reset();
    }

    reset() {
      this.state = {
        username: this.api.session?.username || "",
        currentSceneId: "start",
        currentScene: null,
        selectedChoice: null,
        firstChoice: null,
        locked: false,
        mediationUsed: false,
        currentAC: 0,
        currentMC: 0,
        currentLPS: 0,
        totalAC: 0,
        totalMC: 0,
        totalLPS: 0,
        completed: false,
        version: 0,
        history: []
      };
    }

    async start(sceneId = "start") {
      this.reset();
      await this.loadAssessmentConfig();
      await this.loadScene(sceneId);
    }

    async continueFromSave(progress) {
      this.reset();
      await this.loadAssessmentConfig();
      if (progress) {
        this.state = {
          ...this.state,
          username: progress.username || this.api.session?.username,
          currentSceneId: progress.current_scene || "start",
          selectedChoice: progress.selected_choice || "",
          currentAC: Number(progress.current_AS || progress.current_AC || 0),
          currentMC: Number(progress.current_MS || progress.current_MC || 0),
          currentLPS: Number(progress.current_LPS || 0),
          totalAC: Number(progress.total_AS || progress.total_AC || 0),
          totalMC: Number(progress.total_MS || progress.total_MC || 0),
          totalLPS: Number(progress.total_LPS || 0),
          completed: String(progress.completed) === "true" || progress.completed === true,
          version: Number(progress.version || 0)
        };
      }
      await this.loadScene(this.state.currentSceneId);
    }

    async loadScene(sceneId) {
      const scene = normalizeScene(await this.api.getScene(sceneId));
      if (!scene) throw new Error(`Scene not found: ${sceneId}`);
      this.state.currentSceneId = scene.scene_id;
      this.state.currentScene = scene;
      this.state.selectedChoice = null;
      this.state.firstChoice = null;
      this.state.locked = false;
      this.state.currentAC = 0;
      this.state.currentMC = 0;
      this.state.currentLPS = 0;
      this.dispatch("scene", { scene, state: this.state });
      if (scene.scene_type === "END") {
        this.state.completed = true;
        this.dispatch("ending", { scene, state: this.state });
      }
    }

    selectChoice(index) {
      if (this.state.locked) return;
      const choice = this.getChoices()[index];
      if (!choice) return;
      this.state.selectedChoice = { ...choice, index };
      if (!this.state.firstChoice) this.state.firstChoice = { ...choice, index };
      this.dispatch("choice", { choice: this.state.selectedChoice, state: this.state });
    }

    async confirmChoice() {
      const scene = this.state.currentScene;
      const choice = this.state.selectedChoice;
      if (!scene || !choice || this.state.locked) return;

      this.state.locked = true;
      const as = ["CTQ", "CT2"].includes(scene.scene_type) ? Number(choice.AS || 0) : 0;
      const ms = scene.scene_type === "DAH" ? Number(choice.MS || 0) : 0;
      this.state.currentAC = as;
      this.state.currentMC = ms;
      this.state.currentLPS = calculateLPS(as, ms, this.maxTotalScore());

      if (["CTQ", "CT2", "DAH"].includes(scene.scene_type)) {
        this.state.totalAC += as;
        this.state.totalMC += ms;
        this.state.totalLPS = calculateLPS(this.state.totalAC, this.state.totalMC, this.maxTotalScore());
      }

      await this.logInteraction(scene, choice, as, ms);
      this.dispatch("locked", { choice, state: this.state });

      const nextScene = this.resolveNextScene(scene, choice, as, ms);
      window.setTimeout(() => this.loadScene(nextScene), 700);
    }

    resolveNextScene(scene, choice, as, ms) {
      if (scene.scene_type === "CTQ" && as <= 0 && scene.fail_redirect) {
        this.state.mediationUsed = true;
        return scene.fail_redirect;
      }
      if (scene.scene_type === "DAH" && ms <= 0 && scene.fail_redirect) {
        return scene.fail_redirect;
      }
      if (scene.success_redirect && (as > 0 || ms > 0)) {
        return scene.success_redirect;
      }
      return choice.next_scene || scene.fail_redirect || scene.success_redirect || "start";
    }

    async save() {
      const scene = this.state.currentScene;
      if (!scene?.allow_save) throw new Error("ฉากนี้ไม่สามารถบันทึกเกมได้");
      const saved = await this.api.saveProgress({
        username: this.state.username || this.api.session?.username,
        current_scene: this.state.currentSceneId,
        selected_choice: this.state.locked ? this.state.selectedChoice?.text || "" : "",
        current_AC: this.state.currentAC,
        current_MC: this.state.currentMC,
        current_AS: this.state.currentAC,
        current_MS: this.state.currentMC,
        current_LPS: this.state.currentLPS,
        total_AC: this.state.totalAC,
        total_MC: this.state.totalMC,
        total_AS: this.state.totalAC,
        total_MS: this.state.totalMC,
        total_LPS: this.state.totalLPS,
        completed: this.state.completed,
        version: this.state.version
      });
      this.state.version = Number(saved.version || this.state.version + 1);
      this.dispatch("saved", { saved, state: this.state });
      return saved;
    }

    getChoices() {
      const scene = this.state.currentScene;
      if (!scene) return [];
      return getChoiceNumbers(scene).map((number, displayIndex) => ({
        index: displayIndex,
        choiceNumber: number,
        text: scene[`choice_${number}_text`],
        next_scene: scene[`choice_${number}_next_scene`],
        AS: Number(scene[`choice_${number}_AS`] || scene[`choice_${number}_AC`] || 0),
        MS: Number(scene[`choice_${number}_MS`] || scene[`choice_${number}_MC`] || 0)
      })).filter((choice) => choice.text);
    }

    maxTotalScore() {
      return Math.max(Number(this.assessmentConfig.totalAcMaxScore || this.config.totalAcMaxScore || this.config.lpsMaxScore || 1), 1);
    }

    async loadAssessmentConfig() {
      try {
        this.assessmentConfig = await this.api.getAssessmentConfig();
      } catch (error) {
        this.assessmentConfig = {
          totalAcMaxScore: Number(this.config.totalAcMaxScore || this.config.lpsMaxScore || 1)
        };
      }
    }

    async logInteraction(scene, choice, ac, mc) {
      this.state.history.push({
        scene_id: scene.scene_id,
        scene_type: scene.scene_type,
        final_choice: choice.text,
        AC: ac,
        MC: scene.scene_type === "DAH" ? mc : 0,
        AS: ac,
        MS: scene.scene_type === "DAH" ? mc : 0,
        LPS: this.state.currentLPS
      });
      await this.api.logGameplay({
        username: this.state.username || this.api.session?.username,
        scene_id: scene.scene_id,
        scene_type: scene.scene_type,
        first_choice: this.state.firstChoice?.text || choice.text,
        final_choice: choice.text,
        AC: ac,
        MC: scene.scene_type === "DAH" ? mc : 0,
        AS: ac,
        MS: scene.scene_type === "DAH" ? mc : 0,
        LPS: this.state.currentLPS,
        mediation_used: this.state.mediationUsed || scene.scene_type === "DAH",
        client_event_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      });
    }

    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  function calculateLPS(ac, mc, maxScore) {
    const max = Math.max(Number(maxScore || 1), 1);
    return Number((((2 * Number(mc || 0)) - Number(ac || 0)) / max).toFixed(2));
  }

  function getChoiceNumbers(scene) {
    return Object.keys(scene)
      .map((key) => key.match(/^choice_(\d+)_text$/))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter((number) => number >= 1 && number <= 4)
      .sort((a, b) => a - b);
  }

  function normalizeScene(scene) {
    if (!scene) return null;
    return {
      ...scene,
      retry_allowed: scene.retry_allowed === true || String(scene.retry_allowed).toUpperCase() === "TRUE",
      allow_save: scene.allow_save === true || String(scene.allow_save).toUpperCase() === "TRUE",
      max_score: Number(scene.max_score || window.TREASURE_CONFIG.lpsMaxScore)
    };
  }

  window.IFEngine = IFEngine;
  window.calculateLPS = calculateLPS;
})();
