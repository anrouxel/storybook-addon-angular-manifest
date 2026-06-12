import { global } from "@storybook/global";
import { logger } from "storybook/internal/client-logger";
import type { ArgTypes, InputType, SBType } from "storybook/internal/types";

import type {
	Argument,
	Class,
	CompodocJson,
	Component,
	Directive,
	Injectable,
	JsDocTag,
	Method,
	Pipe,
	Property,
} from "./compodocTypes";

export const findComponentByName = (name: string, compodocJson: CompodocJson) =>
	compodocJson.components.find((c: Component) => c.name === name) ||
	compodocJson.directives.find((c: Directive) => c.name === name) ||
	compodocJson.pipes.find((c: Pipe) => c.name === name) ||
	compodocJson.injectables.find((c: Injectable) => c.name === name) ||
	compodocJson.classes.find((c: Class) => c.name === name);
