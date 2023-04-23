import { LocationQuery, LocationQueryRaw } from '../query';
import { PathParserOptions } from '../matcher';
import { Ref, ComponentPublicInstance, Component, DefineComponent } from 'vue';
import { RouteRecord, RouteRecordNormalized } from '../matcher/types';
import { HistoryState } from '../history/common';
import { NavigationFailure } from '../errors';
export declare type Lazy<T> = () => Promise<T>;
export declare type Override<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
export declare type Immutable<T> = {
    readonly [P in keyof T]: Immutable<T[P]>;
};
/**
 * Type to transform a static object into one that allows passing Refs as
 * values.
 * @internal
 */
export declare type VueUseOptions<T> = {
    [k in keyof T]: Ref<T[k]> | T[k];
};
export declare type TODO = any;
/**
 * @internal
 */
export declare type RouteParamValue = string;
/**
 * @internal
 */
export declare type RouteParamValueRaw = RouteParamValue | number | null | undefined;
export declare type RouteParams = Record<string, RouteParamValue | RouteParamValue[]>;
export declare type RouteParamsRaw = Record<string, RouteParamValueRaw | Exclude<RouteParamValueRaw, null | undefined>[]>;
/**
 * @internal
 */
export interface RouteQueryAndHash {
    query?: LocationQueryRaw;
    hash?: string;
}
/**
 * @internal
 */
export interface MatcherLocationAsPath {
    path: string;
}
/**
 * @internal
 */
export interface MatcherLocationAsName {
    name: RouteRecordName;
    params?: RouteParams;
}
/**
 * @internal
 */
export interface MatcherLocationAsRelative {
    params?: RouteParams;
}
/**
 * @internal
 */
export interface LocationAsRelativeRaw {
    name?: RouteRecordName;
    params?: RouteParamsRaw;
}
/**
 * Common options for all navigation methods.
 */
export interface RouteLocationOptions {
    /**
     * Replace the entry in the history instead of pushing a new entry
     */
    replace?: boolean;
    /**
     * Triggers the navigation even if the location is the same as the current one.
     * Note this will also add a new entry to the history unless `replace: true`
     * is passed.
     */
    force?: boolean;
    /**
     * State to save using the History API. This cannot contain any reactive
     * values and some primitives like Symbols are forbidden. More info at
     * https://developer.mozilla.org/en-US/docs/Web/API/History/state
     */
    state?: HistoryState;
}
/**
 * User-level route location
 */
export declare type RouteLocationRaw = string | RouteLocationPathRaw | RouteLocationNamedRaw;
/**
 * Route Location that can infer the necessary params based on the name.
 *
 * @internal
 */
export interface RouteLocationNamedRaw extends RouteQueryAndHash, LocationAsRelativeRaw, RouteLocationOptions {
}
/**
 * Route Location that can infer the possible paths.
 *
 * @internal
 */
export interface RouteLocationPathRaw extends RouteQueryAndHash, MatcherLocationAsPath, RouteLocationOptions {
}
export interface RouteLocationMatched extends RouteRecordNormalized {
    components: Record<string, RouteComponent> | null | undefined;
}
/**
 * Base properties for a normalized route location.
 *
 * @internal
 */
export interface _RouteLocationBase extends Pick<MatcherLocation, 'name' | 'path' | 'params' | 'meta'> {
    /**
     * The whole location including the `search` and `hash`. This string is
     * percentage encoded.
     */
    fullPath: string;
    /**
     * Object representation of the `search` property of the current location.
     */
    query: LocationQuery;
    /**
     * Hash of the current location. If present, starts with a `#`.
     */
    hash: string;
    /**
     * Contains the location we were initially trying to access before ending up
     * on the current location.
     */
    redirectedFrom: RouteLocation | undefined;
}
/**
 * {@link RouteLocationRaw} with
 */
export interface RouteLocationNormalizedLoaded extends _RouteLocationBase {
    /**
     * Array of {@link RouteLocationMatched} containing only plain components (any
     * lazy-loaded components have been loaded and were replaced inside the
     * `components` object) so it can be directly used to display routes. It
     * cannot contain redirect records either
     */
    matched: RouteLocationMatched[];
}
/**
 * {@link RouteLocationRaw} resolved using the matcher
 */
export interface RouteLocation extends _RouteLocationBase {
    /**
     * Array of {@link RouteRecord} containing components as they were
     * passed when adding records. It can also contain redirect records. This
     * can't be used directly
     */
    matched: RouteRecord[];
}
/**
 * Similar to {@link RouteLocation} but its
 * {@link RouteLocationNormalized.matched} cannot contain redirect records
 */
export interface RouteLocationNormalized extends _RouteLocationBase {
    /**
     * Array of {@link RouteRecordNormalized}
     */
    matched: RouteRecordNormalized[];
}
/**
 * Allowed Component in {@link RouteLocationMatched}
 */
export declare type RouteComponent = Component | DefineComponent;
/**
 * Allowed Component definitions in route records provided by the user
 */
export declare type RawRouteComponent = RouteComponent | Lazy<RouteComponent>;
/**
 * Possible values for a user-defined route record's name
 */
export declare type RouteRecordName = string | symbol;
/**
 * @internal
 */
export declare type _RouteRecordProps = boolean | Record<string, any> | ((to: RouteLocationNormalized) => Record<string, any>);
/**
 * Common properties among all kind of {@link RouteRecordRaw}
 * @internal
 */
export interface _RouteRecordBase extends PathParserOptions {
    /**
     * Path of the record. Should start with `/` unless the record is the child of
     * another record.
     *
     * @example `/users/:id` matches `/users/1` as well as `/users/posva`.
     */
    path: string;
    /**
     * Where to redirect if the route is directly matched. The redirection happens
     * before any navigation guard and triggers a new navigation with the new
     * target location.
     */
    redirect?: RouteRecordRedirectOption;
    /**
     * Aliases for the record. Allows defining extra paths that will behave like a
     * copy of the record. Allows having paths shorthands like `/users/:id` and
     * `/u/:id`. All `alias` and `path` values must share the same params.
     */
    alias?: string | string[];
    /**
     * Name for the route record.
     */
    name?: RouteRecordName;
    /**
     * Before Enter guard specific to this record. Note `beforeEnter` has no
     * effect if the record has a `redirect` property.
     */
    beforeEnter?: NavigationGuardWithThis<undefined> | NavigationGuardWithThis<undefined>[];
    /**
     * Arbitrary data attached to the record.
     */
    meta?: RouteMeta;
    /**
     * Array of nested routes.
     */
    children?: RouteRecordRaw[];
    /**
     * Allow passing down params as props to the component rendered by `router-view`.
     */
    props?: _RouteRecordProps | Record<string, _RouteRecordProps>;
}
/**
 * Interface to type `meta` fields in route records.
 *
 * @example
 *
 * ```ts
 * // typings.d.ts or router.ts
 * import 'vue-router';
 *
 * declare module 'vue-router' {
 *   interface RouteMeta {
 *     requiresAuth?: boolean
 *   }
 *  }
 * ```
 */
export interface RouteMeta extends Record<string | number | symbol, unknown> {
}
/**
 * @internal
 */
export declare type RouteRecordRedirectOption = RouteLocationRaw | ((to: RouteLocation) => RouteLocationRaw);
/**
 * Route Record defining one single component with the `component` option.
 */
export interface RouteRecordSingleView extends _RouteRecordBase {
    /**
     * Component to display when the URL matches this route.
     */
    component: RawRouteComponent;
    components?: never;
    children?: never;
    redirect?: never;
    /**
     * Allow passing down params as props to the component rendered by `router-view`.
     */
    props?: _RouteRecordProps;
}
/**
 * Route Record defining one single component with a nested view.
 */
export interface RouteRecordSingleViewWithChildren extends _RouteRecordBase {
    /**
     * Component to display when the URL matches this route.
     */
    component?: RawRouteComponent | null | undefined;
    components?: never;
    children: RouteRecordRaw[];
    /**
     * Allow passing down params as props to the component rendered by `router-view`.
     */
    props?: _RouteRecordProps;
}
/**
 * Route Record defining multiple named components with the `components` option.
 */
export interface RouteRecordMultipleViews extends _RouteRecordBase {
    /**
     * Components to display when the URL matches this route. Allow using named views.
     */
    components: Record<string, RawRouteComponent>;
    component?: never;
    children?: never;
    redirect?: never;
    /**
     * Allow passing down params as props to the component rendered by
     * `router-view`. Should be an object with the same keys as `components` or a
     * boolean to be applied to every component.
     */
    props?: Record<string, _RouteRecordProps> | boolean;
}
/**
 * Route Record defining multiple named components with the `components` option and children.
 */
export interface RouteRecordMultipleViewsWithChildren extends _RouteRecordBase {
    /**
     * Components to display when the URL matches this route. Allow using named views.
     */
    components?: Record<string, RawRouteComponent> | null | undefined;
    component?: never;
    children: RouteRecordRaw[];
    /**
     * Allow passing down params as props to the component rendered by
     * `router-view`. Should be an object with the same keys as `components` or a
     * boolean to be applied to every component.
     */
    props?: Record<string, _RouteRecordProps> | boolean;
}
/**
 * Route Record that defines a redirect. Cannot have `component` or `components`
 * as it is never rendered.
 */
export interface RouteRecordRedirect extends _RouteRecordBase {
    redirect: RouteRecordRedirectOption;
    component?: never;
    components?: never;
    props?: never;
}
export declare type RouteRecordRaw = RouteRecordSingleView | RouteRecordSingleViewWithChildren | RouteRecordMultipleViews | RouteRecordMultipleViewsWithChildren | RouteRecordRedirect;
/**
 * Initial route location where the router is. Can be used in navigation guards
 * to differentiate the initial navigation.
 *
 * @example
 * ```js
 * import { START_LOCATION } from 'vue-router'
 *
 * router.beforeEach((to, from) => {
 *   if (from === START_LOCATION) {
 *     // initial navigation
 *   }
 * })
 * ```
 */
export declare const START_LOCATION_NORMALIZED: RouteLocationNormalizedLoaded;
/**
 * Route location that can be passed to the matcher.
 */
export declare type MatcherLocationRaw = MatcherLocationAsPath | MatcherLocationAsName | MatcherLocationAsRelative;
/**
 * Normalized/resolved Route location that returned by the matcher.
 */
export interface MatcherLocation {
    /**
     * Name of the matched record
     */
    name: RouteRecordName | null | undefined;
    /**
     * Percentage encoded pathname section of the URL.
     */
    path: string;
    /**
     * Object of decoded params extracted from the `path`.
     */
    params: RouteParams;
    /**
     * Merged `meta` properties from all the matched route records.
     */
    meta: RouteMeta;
    /**
     * Array of {@link RouteRecord} containing components as they were
     * passed when adding records. It can also contain redirect records. This
     * can't be used directly
     */
    matched: RouteRecord[];
}
export interface NavigationGuardNext {
    (): void;
    (error: Error): void;
    (location: RouteLocationRaw): void;
    (valid: boolean | undefined): void;
    (cb: NavigationGuardNextCallback): void;
}
export declare type NavigationGuardNextCallback = (vm: ComponentPublicInstance) => any;
export declare type NavigationGuardReturn = void | Error | RouteLocationRaw | boolean | NavigationGuardNextCallback;
/**
 * Navigation guard. See [Navigation
 * Guards](/guide/advanced/navigation-guards.md).
 */
export interface NavigationGuard {
    (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext): NavigationGuardReturn | Promise<NavigationGuardReturn>;
}
/**
 * {@inheritDoc NavigationGuard}
 */
export interface NavigationGuardWithThis<T> {
    (this: T, to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext): NavigationGuardReturn | Promise<NavigationGuardReturn>;
}
export interface NavigationHookAfter {
    (to: RouteLocationNormalized, from: RouteLocationNormalized, failure?: NavigationFailure | void): any;
}
export * from './typeGuards';
export declare type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
//# sourceMappingURL=index.d.ts.map