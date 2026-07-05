const path = require("path");
const fs = require("fs");
const { Project } = require(path.join(__dirname, "..", "_ts_morph_tmp", "node_modules", "ts-morph"));

async function run() {
  const project = new Project({
    tsConfigFilePath: "apps/web/tsconfig.json",
  });

  const nadaAppFile = project.getSourceFile("apps/web/src/components/NadaApp.tsx");
  if (!nadaAppFile) return;

  const dirs = ["utils", "components/panels", "components/screens", "components/chat"];
  dirs.forEach(d => {
    const dirPath = path.join(__dirname, "..", "apps", "web", "src", d);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  });

  const mapping = {
    // Utilities
    "utils/helpers.ts": [
      "mergeMessageRecords", "statusCommentChatId", "parseStatusCommentPayload",
      "parseStatusReactionPayload", "parseStatusDeletePayload", "parseGroupDeletePayload",
      "parseNotificationSettings", "notificationToneLabel", "notificationRingtoneLabel",
      "deliveryStatusRank", "deliveryStatusGlyph", "parseCommunityRecords",
      "parseSafetyReports", "defaultCommunityChannels", "defaultCommunityTopics",
      "loadStatusComments", "isLegacyNadaName", "upsertContact", "upsertGroupFromInvite",
      "extractMentions", "matchesSearch", "formatRelativeTime", "dataUrlSize",
      "persistIncomingMessages", "persistIncomingGroupMessages", "generateRandomUsername"
    ],
    // Screens
    "components/screens/Dashboard.tsx": ["Dashboard"],
    "components/screens/Onboarding.tsx": ["Onboarding"],
    "components/screens/CommunitiesHome.tsx": ["CommunitiesHome", "CommunityCreateSheet", "GroupsHome"],
    "components/screens/StatusView.tsx": ["StatusView", "StatusCreateSheet", "StatusViewerSheet"],
    // Chat
    "components/chat/ChatPanel.tsx": ["ChatPanel", "MessageContent", "MessageTextWithLinks", "MediaLoadingState", "GlobalSearchResults"],
    "components/chat/AttachmentMenu.tsx": ["AttachmentMenu", "AttachmentPreview"],
    // Panels
    "components/panels/SettingsSheet.tsx": ["SettingsSheet", "SettingsSheetSection", "SettingsDashboardPreview", "SettingsPreviewSection", "SettingsPreviewButton"],
    "components/panels/BillingSheet.tsx": ["BillingSheet"],
    "components/panels/ContactSheets.tsx": ["ContactSheet", "GroupSheet", "MigrationSheet", "ShareSheet"],
    "components/panels/SafetyReportSheet.tsx": ["SafetyReportSheet"],
    "components/panels/Sheet.tsx": ["Sheet", "LaunchOnboardingSheet"],
    "components/panels/Dialogs.tsx": ["ConfirmChatActionDialog", "MessageContextAction"],
    // Misc Core
    "components/AppLoading.tsx": ["Splash", "ScreenLoading"],
    "components/OfflineBanner.tsx": ["OfflineBanner", "useOnlineStatus"]
  };

  const files = {};

  for (const [filePath, funcNames] of Object.entries(mapping)) {
    const fullPath = `apps/web/src/${filePath}`;
    // Find if file exists in project or create it
    let file = project.getSourceFile(fullPath);
    if (!file) {
      file = project.createSourceFile(fullPath, "", { overwrite: true });
    }
    files[filePath] = file;
    
    for (const fnName of funcNames) {
      const fn = nadaAppFile.getFunction(fnName) || nadaAppFile.getVariableStatement(fnName);
      if (fn) {
        console.log(`Moving ${fnName} to ${filePath}`);
        
        if (fn.getKindName() === "FunctionDeclaration") {
          file.addFunction({ ...fn.getStructure(), isExported: true });
        } else if (fn.getKindName() === "VariableStatement") {
          file.addVariableStatement({ ...fn.getStructure(), isExported: true });
        }
        fn.remove();
      }
    }
  }

  // To fix imports correctly, we just run fixMissingImports on everything
  for (const file of Object.values(files)) {
    file.fixMissingImports();
  }
  nadaAppFile.fixMissingImports();

  await project.save();
  console.log("Done splitting NadaApp.tsx.");
}

run().catch(console.error);
