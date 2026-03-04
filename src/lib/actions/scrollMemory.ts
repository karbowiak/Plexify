const scrollPositions = new Map<string, { top: number; left: number }>();
let currentPath = '';
const listeners = new Set<(oldPath: string, newPath: string) => void>();

export function trackPath(path: string) {
	const prevPath = currentPath;
	if (prevPath === path) return;
	currentPath = path;
	for (const fn of listeners) fn(prevPath, path);
}

function isScrollable(node: HTMLElement): boolean {
	return node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
}

export function scrollMemory(node: HTMLElement, containerId: string) {
	function key(path: string) {
		return `${containerId}:${path}`;
	}

	function restore(path: string) {
		const saved = scrollPositions.get(key(path));
		node.scrollTop = saved?.top ?? 0;
		node.scrollLeft = saved?.left ?? 0;
	}

	function save(path: string) {
		if (path && isScrollable(node)) {
			scrollPositions.set(key(path), { top: node.scrollTop, left: node.scrollLeft });
		}
	}

	function onScroll() {
		save(currentPath);
	}

	function onPathChange(oldPath: string, newPath: string) {
		save(oldPath);
		requestAnimationFrame(() => restore(newPath));
	}

	restore(currentPath);
	node.addEventListener('scroll', onScroll, { passive: true });
	listeners.add(onPathChange);

	return {
		destroy() {
			save(currentPath);
			node.removeEventListener('scroll', onScroll);
			listeners.delete(onPathChange);
		}
	};
}
