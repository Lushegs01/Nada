const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project();
// running from inside apps/web
const filePath = path.join(__dirname, 'src/components/screens/Dashboard.tsx');
const sourceFile = project.addSourceFileAtPath(filePath);

const storeProps = [
  'ghostMode', 'mood', 'notificationSettings', 'showOnboarding',
  'chats', 'contacts', 'messages', 'allStatuses', 'communities', 'safetyReports',
  'selectedContactHash', 'selectedGroupId', 'selectedStatusSenderHash',
  'disappearingTimer', 'displayName', 'editingMessageId', 'replyToId', 'forwardMessageId',
  'panel', 'activeTab', 'activeFilter', 'searchQuery', 'messageSearchQuery', 'globalSearchResults', 'uploadStatus',
  'blurShieldActive', 'blurShieldRevealed', 'showGhostModal', 'showMoodModal', 'showArchivedChats',
  'pendingChatAction', 'pendingReportTarget', 'inAppNotification',
  'archivedChatIds', 'mutedChatIds'
];

let addedImport = false;

sourceFile.getVariableStatements().forEach(stmt => {
  const decList = stmt.getDeclarationList();
  decList.getDeclarations().forEach(dec => {
    const initializer = dec.getInitializer();
    if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
      const expr = initializer.getExpression();
      if (expr.getText() === 'useState') {
        const nameNode = dec.getNameNode();
        if (nameNode.getKind() === SyntaxKind.ArrayBindingPattern) {
          const elements = nameNode.getElements();
          if (elements.length >= 2) {
            const stateName = elements[0].getText();
            let setterName = elements[1].getText();
            
            if (storeProps.includes(stateName) || stateName === 'chatPref') {
              let actualStateName = stateName;
              if (stateName === 'chatPref') {
                 // handle special manual name change?
                 // let's skip chatPref for automatic because it was setChatPrefState
                 return;
              }

              // Create the Zustand replacements
              const stateLine = `const ${actualStateName} = useDashboardStore((state) => state.${actualStateName});`;
              const setterLine = `const ${setterName} = useDashboardStore((state) => state.${setterName});`;
              
              // Replace the statement
              stmt.replaceWithText(`${stateLine}\n    ${setterLine}`);
              
              if (!addedImport) {
                sourceFile.addImportDeclaration({
                  namedImports: ['useDashboardStore'],
                  moduleSpecifier: '@/stores/useDashboardStore'
                });
                addedImport = true;
              }
            }
          }
        }
      }
    }
  });
});

sourceFile.saveSync();
console.log('Successfully migrated useState to Zustand');
