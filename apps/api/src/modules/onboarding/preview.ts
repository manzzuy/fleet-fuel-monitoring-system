import { validateWorkbookStructure, parseOnboardingWorkbook } from './parser';
import { validateWorkbookRows } from './validators';

export async function buildOnboardingPreview(tenantId: string, workbookPath: string) {
  const workbook = parseOnboardingWorkbook(workbookPath);
  const structureIssues = validateWorkbookStructure(workbook);
  const validation = await validateWorkbookRows(tenantId, workbook);

  if (structureIssues.length > 0) {
    validation.sheets.Sites.errors.unshift(...structureIssues);
    validation.summary.errors_count += structureIssues.length;
  }

  return validation;
}
