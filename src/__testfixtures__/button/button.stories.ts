import type { Meta, StoryObj } from "@storybook/angular";
import { ButtonComponent } from "./button.component";

const meta: Meta<ButtonComponent> = {
	title: "Components/Button",
	component: ButtonComponent,
};
export default meta;

export const Primary: StoryObj<ButtonComponent> = {
	args: { label: "Click me", disabled: false },
};

export const Disabled: StoryObj<ButtonComponent> = {
	args: { label: "Click me", disabled: true },
};

export const WithOutput: StoryObj<ButtonComponent> = {
	args: { clicked: undefined },
};

/**
 * Uses the raw render template instead of Compodoc snippet.
 * @useTemplate
 */
export const CustomTemplate: StoryObj<ButtonComponent> = {
	render: (_args) => ({
		template: `<app-button label="custom template"></app-button>`,
	}),
};
