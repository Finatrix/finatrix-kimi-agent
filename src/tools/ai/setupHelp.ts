/** Curated product instructions; never sends a question or financial records to a service. */
export const SETUP_QUESTIONS = ['How do I get started?', 'How do I import expenses?', 'Where is the emergency-fund planner?', 'How do I compare goals?', 'How do I control my privacy?'];

export function setupHelp(question: string): string | null {
  const q = question.toLowerCase().trim();
  if (/get started|onboard|how (do|can) i (start|set up)|setup help/.test(q)) return 'Start with Set up your month to choose your market and enter take-home income. Next, add a few payments in Expenses or import a statement. Return to Dashboard to review the month, check recurring payments and plan an emergency reserve. You can skip setup and return to it later. Existing saved plans are preserved.';
  if (/how (do|can) i import|where.*import/.test(q)) return 'Open Expenses and choose Import statement. Select your file, check the detected amounts and categories, then confirm the entries you want to save. Importing does not connect your bank account. Check for missing or duplicate entries before relying on a monthly review.';
  if (/where.*emergency|how (do|can) i.*emergency.*plan/.test(q)) return 'Your emergency-fund planner is on Dashboard, below the monthly review. Enter essential monthly costs, months of cover, accessible savings and a monthly contribution. It shows the remaining target and a timeline without assuming investment returns.';
  if (/how (do|can) i compare.*(goal|scenario)|where.*scenario/.test(q)) return 'Open Goals, enter a target and deadline, then calculate your plan. In Compare the trade-offs, change the alternative target, deadline or starting savings. Both columns use the same return and inflation assumptions. Enter your monthly limit to see what remains for other priorities. Comparing does not replace your saved goal.';
  if (/how (do|can) i.*privacy|where.*privacy|how (do|can) i.*(delete|export).*data/.test(q)) return 'Open Settings → Privacy control centre. You can turn off optional usage analytics for this device, clear local chat history, export your finance records and review data-removal options. Signed-in finance data syncs to your account. AI questions and relevant financial context are sent to the AI service when you ask for an AI answer.';
  return null;
}
