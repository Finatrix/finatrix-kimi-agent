import type { PluginCreator } from 'postcss';

/** The media query every :hover rule is moved behind. */
export declare const HOVER_MEDIA: string;
declare const hoverGate: PluginCreator<void>;
export default hoverGate;
