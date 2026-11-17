/* ############################################
   #                                          #
   #         JOURNALISATION DE DEV            #
   #                                          #
   ############################################ */

// Passer à true pour activer les logs pendant le développement
const ODM_DEBUG = false;

function odmLog(...args) {
  if (ODM_DEBUG) {
    console.log('[ODM]', ...args);
  }
}
