import { useState } from 'react';

export function Component() {
	const [state] = useState(Math.random());
	return (
		<>
			<div id="test" data-testid="test-component" className="bg-[red]">
				{state}
			</div>
			<div>replace-me</div>
		</>
	);
}
