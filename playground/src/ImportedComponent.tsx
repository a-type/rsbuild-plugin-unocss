import { useEffect, useState } from 'react';

export function ImportedComponent() {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => {
			setCount((c) => c + 1);
		}, 1000);
		return () => clearInterval(interval);
	}, []);
	return (
		<div className="p-xs border border-default">
			Imported Component: {count}
		</div>
	);
}
