(function () {
  function exportWorkbook(filename, sheets) {
    const workbook = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => {
      const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ empty: "No data" }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(name));
    });
    XLSX.writeFile(workbook, filename);
  }

  function buildAnalyticsSheets(data, filteredProgress = data.progress || [], extraSheets = {}) {
    return {
      Summary: [data.summary || {}],
      PlayerProgress: filteredProgress,
      IndividualSummary: extraSheets.individualSummary || [],
      ScoredChoices: extraSheets.scoredChoices || [],
      GameplayLogs: data.logs || [],
      DifficultScenes: data.difficultScenes || [],
      ChoiceStats: data.choiceStats || [],
      BranchingPaths: data.pathStats || []
    };
  }

  function sanitizeSheetName(name) {
    return name.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
  }

  window.TreasureExport = {
    exportWorkbook,
    buildAnalyticsSheets
  };
})();
