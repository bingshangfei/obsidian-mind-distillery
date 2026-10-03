/** PARA 归序决策表（协议 §3）的代码形态。LLM 只产出分类字段，落笔归这里。 */
export type ParaArea = "inbox" | "projects" | "areas" | "resources" | "archives";

export interface ParaFolders {
	inbox: string;
	projects: string;
	areas: string;
	resources: string;
	archives: string;
}

export interface ParaClassification {
	type: string;
	area: string;
	hasDeadline: boolean;
	/** true = this is personal knowledge worth a card, false = raw material / news. */
	isAreaKnowledge: boolean;
	isReference: boolean;
	isDone: boolean;
}

/** Decision-table order: deadline → area knowledge → reference → done → stay. */
export function paraTarget(c: ParaClassification, folders: ParaFolders): ParaArea {
	if (c.isDone) return "archives";
	if (c.hasDeadline) return "projects";
	if (c.isAreaKnowledge) return "areas";
	if (c.isReference) return "resources";
	return "inbox";
}

export function folderFor(target: ParaArea, folders: ParaFolders, area: string): string {
	switch (target) {
		case "projects":
			return folders.projects;
		case "areas":
			return area ? `${folders.areas}/${area}` : folders.areas;
		case "resources":
			return folders.resources;
		case "archives":
			return `${folders.archives}/${new Date().getFullYear()}`;
		case "inbox":
		default:
			return folders.inbox;
	}
}
