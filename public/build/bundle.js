var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.29.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    const LOCATION = {};
    const ROUTER = {};

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    function getLocation(source) {
      return {
        ...source.location,
        state: source.history.state,
        key: (source.history.state && source.history.state.key) || "initial"
      };
    }

    function createHistory(source, options) {
      const listeners = [];
      let location = getLocation(source);

      return {
        get location() {
          return location;
        },

        listen(listener) {
          listeners.push(listener);

          const popstateListener = () => {
            location = getLocation(source);
            listener({ location, action: "POP" });
          };

          source.addEventListener("popstate", popstateListener);

          return () => {
            source.removeEventListener("popstate", popstateListener);

            const index = listeners.indexOf(listener);
            listeners.splice(index, 1);
          };
        },

        navigate(to, { state, replace = false } = {}) {
          state = { ...state, key: Date.now() + "" };
          // try...catch iOS Safari limits to 100 pushState calls
          try {
            if (replace) {
              source.history.replaceState(state, null, to);
            } else {
              source.history.pushState(state, null, to);
            }
          } catch (e) {
            source.location[replace ? "replace" : "assign"](to);
          }

          location = getLocation(source);
          listeners.forEach(listener => listener({ location, action: "PUSH" }));
        }
      };
    }

    // Stores history entries in memory for testing or other platforms like Native
    function createMemorySource(initialPathname = "/") {
      let index = 0;
      const stack = [{ pathname: initialPathname, search: "" }];
      const states = [];

      return {
        get location() {
          return stack[index];
        },
        addEventListener(name, fn) {},
        removeEventListener(name, fn) {},
        history: {
          get entries() {
            return stack;
          },
          get index() {
            return index;
          },
          get state() {
            return states[index];
          },
          pushState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            index++;
            stack.push({ pathname, search });
            states.push(state);
          },
          replaceState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            stack[index] = { pathname, search };
            states[index] = state;
          }
        }
      };
    }

    // Global history uses window.history as the source if available,
    // otherwise a memory history
    const canUseDOM = Boolean(
      typeof window !== "undefined" &&
        window.document &&
        window.document.createElement
    );
    const globalHistory = createHistory(canUseDOM ? window : createMemorySource());
    const { navigate } = globalHistory;

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    const paramRe = /^:(.+)/;

    const SEGMENT_POINTS = 4;
    const STATIC_POINTS = 3;
    const DYNAMIC_POINTS = 2;
    const SPLAT_PENALTY = 1;
    const ROOT_POINTS = 1;

    /**
     * Check if `string` starts with `search`
     * @param {string} string
     * @param {string} search
     * @return {boolean}
     */
    function startsWith(string, search) {
      return string.substr(0, search.length) === search;
    }

    /**
     * Check if `segment` is a root segment
     * @param {string} segment
     * @return {boolean}
     */
    function isRootSegment(segment) {
      return segment === "";
    }

    /**
     * Check if `segment` is a dynamic segment
     * @param {string} segment
     * @return {boolean}
     */
    function isDynamic(segment) {
      return paramRe.test(segment);
    }

    /**
     * Check if `segment` is a splat
     * @param {string} segment
     * @return {boolean}
     */
    function isSplat(segment) {
      return segment[0] === "*";
    }

    /**
     * Split up the URI into segments delimited by `/`
     * @param {string} uri
     * @return {string[]}
     */
    function segmentize(uri) {
      return (
        uri
          // Strip starting/ending `/`
          .replace(/(^\/+|\/+$)/g, "")
          .split("/")
      );
    }

    /**
     * Strip `str` of potential start and end `/`
     * @param {string} str
     * @return {string}
     */
    function stripSlashes(str) {
      return str.replace(/(^\/+|\/+$)/g, "");
    }

    /**
     * Score a route depending on how its individual segments look
     * @param {object} route
     * @param {number} index
     * @return {object}
     */
    function rankRoute(route, index) {
      const score = route.default
        ? 0
        : segmentize(route.path).reduce((score, segment) => {
            score += SEGMENT_POINTS;

            if (isRootSegment(segment)) {
              score += ROOT_POINTS;
            } else if (isDynamic(segment)) {
              score += DYNAMIC_POINTS;
            } else if (isSplat(segment)) {
              score -= SEGMENT_POINTS + SPLAT_PENALTY;
            } else {
              score += STATIC_POINTS;
            }

            return score;
          }, 0);

      return { route, score, index };
    }

    /**
     * Give a score to all routes and sort them on that
     * @param {object[]} routes
     * @return {object[]}
     */
    function rankRoutes(routes) {
      return (
        routes
          .map(rankRoute)
          // If two routes have the exact same score, we go by index instead
          .sort((a, b) =>
            a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
          )
      );
    }

    /**
     * Ranks and picks the best route to match. Each segment gets the highest
     * amount of points, then the type of segment gets an additional amount of
     * points where
     *
     *  static > dynamic > splat > root
     *
     * This way we don't have to worry about the order of our routes, let the
     * computers do it.
     *
     * A route looks like this
     *
     *  { path, default, value }
     *
     * And a returned match looks like:
     *
     *  { route, params, uri }
     *
     * @param {object[]} routes
     * @param {string} uri
     * @return {?object}
     */
    function pick(routes, uri) {
      let match;
      let default_;

      const [uriPathname] = uri.split("?");
      const uriSegments = segmentize(uriPathname);
      const isRootUri = uriSegments[0] === "";
      const ranked = rankRoutes(routes);

      for (let i = 0, l = ranked.length; i < l; i++) {
        const route = ranked[i].route;
        let missed = false;

        if (route.default) {
          default_ = {
            route,
            params: {},
            uri
          };
          continue;
        }

        const routeSegments = segmentize(route.path);
        const params = {};
        const max = Math.max(uriSegments.length, routeSegments.length);
        let index = 0;

        for (; index < max; index++) {
          const routeSegment = routeSegments[index];
          const uriSegment = uriSegments[index];

          if (routeSegment !== undefined && isSplat(routeSegment)) {
            // Hit a splat, just grab the rest, and return a match
            // uri:   /files/documents/work
            // route: /files/* or /files/*splatname
            const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

            params[splatName] = uriSegments
              .slice(index)
              .map(decodeURIComponent)
              .join("/");
            break;
          }

          if (uriSegment === undefined) {
            // URI is shorter than the route, no match
            // uri:   /users
            // route: /users/:userId
            missed = true;
            break;
          }

          let dynamicMatch = paramRe.exec(routeSegment);

          if (dynamicMatch && !isRootUri) {
            const value = decodeURIComponent(uriSegment);
            params[dynamicMatch[1]] = value;
          } else if (routeSegment !== uriSegment) {
            // Current segments don't match, not dynamic, not splat, so no match
            // uri:   /users/123/settings
            // route: /users/:id/profile
            missed = true;
            break;
          }
        }

        if (!missed) {
          match = {
            route,
            params,
            uri: "/" + uriSegments.slice(0, index).join("/")
          };
          break;
        }
      }

      return match || default_ || null;
    }

    /**
     * Check if the `path` matches the `uri`.
     * @param {string} path
     * @param {string} uri
     * @return {?object}
     */
    function match(route, uri) {
      return pick([route], uri);
    }

    /**
     * Add the query to the pathname if a query is given
     * @param {string} pathname
     * @param {string} [query]
     * @return {string}
     */
    function addQuery(pathname, query) {
      return pathname + (query ? `?${query}` : "");
    }

    /**
     * Resolve URIs as though every path is a directory, no files. Relative URIs
     * in the browser can feel awkward because not only can you be "in a directory",
     * you can be "at a file", too. For example:
     *
     *  browserSpecResolve('foo', '/bar/') => /bar/foo
     *  browserSpecResolve('foo', '/bar') => /foo
     *
     * But on the command line of a file system, it's not as complicated. You can't
     * `cd` from a file, only directories. This way, links have to know less about
     * their current path. To go deeper you can do this:
     *
     *  <Link to="deeper"/>
     *  // instead of
     *  <Link to=`{${props.uri}/deeper}`/>
     *
     * Just like `cd`, if you want to go deeper from the command line, you do this:
     *
     *  cd deeper
     *  # not
     *  cd $(pwd)/deeper
     *
     * By treating every path as a directory, linking to relative paths should
     * require less contextual information and (fingers crossed) be more intuitive.
     * @param {string} to
     * @param {string} base
     * @return {string}
     */
    function resolve(to, base) {
      // /foo/bar, /baz/qux => /foo/bar
      if (startsWith(to, "/")) {
        return to;
      }

      const [toPathname, toQuery] = to.split("?");
      const [basePathname] = base.split("?");
      const toSegments = segmentize(toPathname);
      const baseSegments = segmentize(basePathname);

      // ?a=b, /users?b=c => /users?a=b
      if (toSegments[0] === "") {
        return addQuery(basePathname, toQuery);
      }

      // profile, /users/789 => /users/789/profile
      if (!startsWith(toSegments[0], ".")) {
        const pathname = baseSegments.concat(toSegments).join("/");

        return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
      }

      // ./       , /users/123 => /users/123
      // ../      , /users/123 => /users
      // ../..    , /users/123 => /
      // ../../one, /a/b/c/d   => /a/b/one
      // .././one , /a/b/c/d   => /a/b/c/one
      const allSegments = baseSegments.concat(toSegments);
      const segments = [];

      allSegments.forEach(segment => {
        if (segment === "..") {
          segments.pop();
        } else if (segment !== ".") {
          segments.push(segment);
        }
      });

      return addQuery("/" + segments.join("/"), toQuery);
    }

    /**
     * Combines the `basepath` and the `path` into one path.
     * @param {string} basepath
     * @param {string} path
     */
    function combinePaths(basepath, path) {
      return `${stripSlashes(
    path === "/" ? basepath : `${stripSlashes(basepath)}/${stripSlashes(path)}`
  )}/`;
    }

    /**
     * Decides whether a given `event` should result in a navigation or not.
     * @param {object} event
     */
    function shouldNavigate(event) {
      return (
        !event.defaultPrevented &&
        event.button === 0 &&
        !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      );
    }

    /* node_modules/svelte-routing/src/Router.svelte generated by Svelte v3.29.0 */

    function create_fragment(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $base;
    	let $location;
    	let $routes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Router", slots, ['default']);
    	let { basepath = "/" } = $$props;
    	let { url = null } = $$props;
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const routes = writable([]);
    	validate_store(routes, "routes");
    	component_subscribe($$self, routes, value => $$invalidate(10, $routes = value));
    	const activeRoute = writable(null);
    	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

    	// If locationContext is not set, this is the topmost Router in the tree.
    	// If the `url` prop is given we force the location to it.
    	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(9, $location = value));

    	// If routerContext is set, the routerBase of the parent Router
    	// will be the base for this Router's descendants.
    	// If routerContext is not set, the path and resolved uri will both
    	// have the value of the basepath prop.
    	const base = routerContext
    	? routerContext.routerBase
    	: writable({ path: basepath, uri: basepath });

    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(8, $base = value));

    	const routerBase = derived([base, activeRoute], ([base, activeRoute]) => {
    		// If there is no activeRoute, the routerBase will be identical to the base.
    		if (activeRoute === null) {
    			return base;
    		}

    		const { path: basepath } = base;
    		const { route, uri } = activeRoute;

    		// Remove the potential /* or /*splatname from
    		// the end of the child Routes relative paths.
    		const path = route.default
    		? basepath
    		: route.path.replace(/\*.*$/, "");

    		return { path, uri };
    	});

    	function registerRoute(route) {
    		const { path: basepath } = $base;
    		let { path } = route;

    		// We store the original path in the _path property so we can reuse
    		// it when the basepath changes. The only thing that matters is that
    		// the route reference is intact, so mutation is fine.
    		route._path = path;

    		route.path = combinePaths(basepath, path);

    		if (typeof window === "undefined") {
    			// In SSR we should set the activeRoute immediately if it is a match.
    			// If there are more Routes being registered after a match is found,
    			// we just skip them.
    			if (hasActiveRoute) {
    				return;
    			}

    			const matchingRoute = match(route, $location.pathname);

    			if (matchingRoute) {
    				activeRoute.set(matchingRoute);
    				hasActiveRoute = true;
    			}
    		} else {
    			routes.update(rs => {
    				rs.push(route);
    				return rs;
    			});
    		}
    	}

    	function unregisterRoute(route) {
    		routes.update(rs => {
    			const index = rs.indexOf(route);
    			rs.splice(index, 1);
    			return rs;
    		});
    	}

    	if (!locationContext) {
    		// The topmost Router in the tree is responsible for updating
    		// the location store and supplying it through context.
    		onMount(() => {
    			const unlisten = globalHistory.listen(history => {
    				location.set(history.location);
    			});

    			return unlisten;
    		});

    		setContext(LOCATION, location);
    	}

    	setContext(ROUTER, {
    		activeRoute,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute
    	});

    	const writable_props = ["basepath", "url"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		setContext,
    		onMount,
    		writable,
    		derived,
    		LOCATION,
    		ROUTER,
    		globalHistory,
    		pick,
    		match,
    		stripSlashes,
    		combinePaths,
    		basepath,
    		url,
    		locationContext,
    		routerContext,
    		routes,
    		activeRoute,
    		hasActiveRoute,
    		location,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute,
    		$base,
    		$location,
    		$routes
    	});

    	$$self.$inject_state = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("hasActiveRoute" in $$props) hasActiveRoute = $$props.hasActiveRoute;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$base*/ 256) {
    			// This reactive statement will update all the Routes' path when
    			// the basepath changes.
    			 {
    				const { path: basepath } = $base;

    				routes.update(rs => {
    					rs.forEach(r => r.path = combinePaths(basepath, r._path));
    					return rs;
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*$routes, $location*/ 1536) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			 {
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}
    	};

    	return [routes, location, base, basepath, url, $$scope, slots];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { basepath: 3, url: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get basepath() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basepath(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get url() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-routing/src/Route.svelte generated by Svelte v3.29.0 */

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*routeParams*/ 2,
    	location: dirty & /*$location*/ 16
    });

    const get_default_slot_context = ctx => ({
    	params: /*routeParams*/ ctx[1],
    	location: /*$location*/ ctx[4]
    });

    // (40:0) {#if $activeRoute !== null && $activeRoute.route === route}
    function create_if_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(40:0) {#if $activeRoute !== null && $activeRoute.route === route}",
    		ctx
    	});

    	return block;
    }

    // (43:2) {:else}
    function create_else_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope, routeParams, $location*/ 530) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(43:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (41:2) {#if component !== null}
    function create_if_block_1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[4] },
    		/*routeParams*/ ctx[1],
    		/*routeProps*/ ctx[2]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, routeParams, routeProps*/ 22)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 16 && { location: /*$location*/ ctx[4] },
    					dirty & /*routeParams*/ 2 && get_spread_object(/*routeParams*/ ctx[1]),
    					dirty & /*routeProps*/ 4 && get_spread_object(/*routeProps*/ ctx[2])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(41:2) {#if component !== null}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$activeRoute*/ ctx[3] !== null && /*$activeRoute*/ ctx[3].route === /*route*/ ctx[7] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$activeRoute*/ ctx[3] !== null && /*$activeRoute*/ ctx[3].route === /*route*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$activeRoute*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Route", slots, ['default']);
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	validate_store(activeRoute, "activeRoute");
    	component_subscribe($$self, activeRoute, value => $$invalidate(3, $activeRoute = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(4, $location = value));

    	const route = {
    		path,
    		// If no path prop is given, this Route will act as the default Route
    		// that is rendered if no other Route in the Router is a match.
    		default: path === ""
    	};

    	let routeParams = {};
    	let routeProps = {};
    	registerRoute(route);

    	// There is no need to unregister Routes in SSR since it will all be
    	// thrown away anyway.
    	if (typeof window !== "undefined") {
    		onDestroy(() => {
    			unregisterRoute(route);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("path" in $$new_props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		onDestroy,
    		ROUTER,
    		LOCATION,
    		path,
    		component,
    		registerRoute,
    		unregisterRoute,
    		activeRoute,
    		location,
    		route,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), $$new_props));
    		if ("path" in $$props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$props) $$invalidate(0, component = $$new_props.component);
    		if ("routeParams" in $$props) $$invalidate(1, routeParams = $$new_props.routeParams);
    		if ("routeProps" in $$props) $$invalidate(2, routeProps = $$new_props.routeProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$activeRoute*/ 8) {
    			 if ($activeRoute && $activeRoute.route === route) {
    				$$invalidate(1, routeParams = $activeRoute.params);
    			}
    		}

    		 {
    			const { path, component, ...rest } = $$props;
    			$$invalidate(2, routeProps = rest);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location,
    		activeRoute,
    		location,
    		route,
    		path,
    		$$scope,
    		slots
    	];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { path: 8, component: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get path() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set path(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get component() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-routing/src/Link.svelte generated by Svelte v3.29.0 */
    const file = "node_modules/svelte-routing/src/Link.svelte";

    function create_fragment$2(ctx) {
    	let a;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);

    	let a_levels = [
    		{ href: /*href*/ ctx[0] },
    		{ "aria-current": /*ariaCurrent*/ ctx[2] },
    		/*props*/ ctx[1]
    	];

    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    			add_location(a, file, 40, 0, 1249);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(a, "click", /*onClick*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1024) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[10], dirty, null, null);
    				}
    			}

    			set_attributes(a, a_data = get_spread_update(a_levels, [
    				(!current || dirty & /*href*/ 1) && { href: /*href*/ ctx[0] },
    				(!current || dirty & /*ariaCurrent*/ 4) && { "aria-current": /*ariaCurrent*/ ctx[2] },
    				dirty & /*props*/ 2 && /*props*/ ctx[1]
    			]));
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $base;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Link", slots, ['default']);
    	let { to = "#" } = $$props;
    	let { replace = false } = $$props;
    	let { state = {} } = $$props;
    	let { getProps = () => ({}) } = $$props;
    	const { base } = getContext(ROUTER);
    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(14, $base = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(15, $location = value));
    	const dispatch = createEventDispatcher();
    	let href, isPartiallyCurrent, isCurrent, props;

    	function onClick(event) {
    		dispatch("click", event);

    		if (shouldNavigate(event)) {
    			event.preventDefault();

    			// Don't push another entry to the history stack when the user
    			// clicks on a Link to the page they are currently on.
    			const shouldReplace = $location.pathname === href || replace;

    			navigate(href, { state, replace: shouldReplace });
    		}
    	}

    	const writable_props = ["to", "replace", "state", "getProps"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Link> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("to" in $$props) $$invalidate(6, to = $$props.to);
    		if ("replace" in $$props) $$invalidate(7, replace = $$props.replace);
    		if ("state" in $$props) $$invalidate(8, state = $$props.state);
    		if ("getProps" in $$props) $$invalidate(9, getProps = $$props.getProps);
    		if ("$$scope" in $$props) $$invalidate(10, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		createEventDispatcher,
    		ROUTER,
    		LOCATION,
    		navigate,
    		startsWith,
    		resolve,
    		shouldNavigate,
    		to,
    		replace,
    		state,
    		getProps,
    		base,
    		location,
    		dispatch,
    		href,
    		isPartiallyCurrent,
    		isCurrent,
    		props,
    		onClick,
    		$base,
    		$location,
    		ariaCurrent
    	});

    	$$self.$inject_state = $$props => {
    		if ("to" in $$props) $$invalidate(6, to = $$props.to);
    		if ("replace" in $$props) $$invalidate(7, replace = $$props.replace);
    		if ("state" in $$props) $$invalidate(8, state = $$props.state);
    		if ("getProps" in $$props) $$invalidate(9, getProps = $$props.getProps);
    		if ("href" in $$props) $$invalidate(0, href = $$props.href);
    		if ("isPartiallyCurrent" in $$props) $$invalidate(12, isPartiallyCurrent = $$props.isPartiallyCurrent);
    		if ("isCurrent" in $$props) $$invalidate(13, isCurrent = $$props.isCurrent);
    		if ("props" in $$props) $$invalidate(1, props = $$props.props);
    		if ("ariaCurrent" in $$props) $$invalidate(2, ariaCurrent = $$props.ariaCurrent);
    	};

    	let ariaCurrent;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*to, $base*/ 16448) {
    			 $$invalidate(0, href = to === "/" ? $base.uri : resolve(to, $base.uri));
    		}

    		if ($$self.$$.dirty & /*$location, href*/ 32769) {
    			 $$invalidate(12, isPartiallyCurrent = startsWith($location.pathname, href));
    		}

    		if ($$self.$$.dirty & /*href, $location*/ 32769) {
    			 $$invalidate(13, isCurrent = href === $location.pathname);
    		}

    		if ($$self.$$.dirty & /*isCurrent*/ 8192) {
    			 $$invalidate(2, ariaCurrent = isCurrent ? "page" : undefined);
    		}

    		if ($$self.$$.dirty & /*getProps, $location, href, isPartiallyCurrent, isCurrent*/ 45569) {
    			 $$invalidate(1, props = getProps({
    				location: $location,
    				href,
    				isPartiallyCurrent,
    				isCurrent
    			}));
    		}
    	};

    	return [
    		href,
    		props,
    		ariaCurrent,
    		base,
    		location,
    		onClick,
    		to,
    		replace,
    		state,
    		getProps,
    		$$scope,
    		slots
    	];
    }

    class Link extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { to: 6, replace: 7, state: 8, getProps: 9 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Link",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get to() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get state() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getProps() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getProps(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    	  path: basedir,
    	  exports: {},
    	  require: function (path, base) {
          return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
        }
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var dayjs_min = createCommonjsModule(function (module, exports) {
    !function(t,e){module.exports=e();}(commonjsGlobal,function(){var t="millisecond",e="second",n="minute",r="hour",i="day",s="week",u="month",a="quarter",o="year",f="date",h=/^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[^0-9]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?.?(\d+)?$/,c=/\[([^\]]+)]|Y{2,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,d={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_")},$=function(t,e,n){var r=String(t);return !r||r.length>=e?t:""+Array(e+1-r.length).join(n)+t},l={s:$,z:function(t){var e=-t.utcOffset(),n=Math.abs(e),r=Math.floor(n/60),i=n%60;return (e<=0?"+":"-")+$(r,2,"0")+":"+$(i,2,"0")},m:function t(e,n){if(e.date()<n.date())return -t(n,e);var r=12*(n.year()-e.year())+(n.month()-e.month()),i=e.clone().add(r,u),s=n-i<0,a=e.clone().add(r+(s?-1:1),u);return +(-(r+(n-i)/(s?i-a:a-i))||0)},a:function(t){return t<0?Math.ceil(t)||0:Math.floor(t)},p:function(h){return {M:u,y:o,w:s,d:i,D:f,h:r,m:n,s:e,ms:t,Q:a}[h]||String(h||"").toLowerCase().replace(/s$/,"")},u:function(t){return void 0===t}},y="en",M={};M[y]=d;var m=function(t){return t instanceof S},D=function(t,e,n){var r;if(!t)return y;if("string"==typeof t)M[t]&&(r=t),e&&(M[t]=e,r=t);else {var i=t.name;M[i]=t,r=i;}return !n&&r&&(y=r),r||!n&&y},v=function(t,e){if(m(t))return t.clone();var n="object"==typeof e?e:{};return n.date=t,n.args=arguments,new S(n)},g=l;g.l=D,g.i=m,g.w=function(t,e){return v(t,{locale:e.$L,utc:e.$u,x:e.$x,$offset:e.$offset})};var S=function(){function d(t){this.$L=this.$L||D(t.locale,null,!0),this.parse(t);}var $=d.prototype;return $.parse=function(t){this.$d=function(t){var e=t.date,n=t.utc;if(null===e)return new Date(NaN);if(g.u(e))return new Date;if(e instanceof Date)return new Date(e);if("string"==typeof e&&!/Z$/i.test(e)){var r=e.match(h);if(r){var i=r[2]-1||0,s=(r[7]||"0").substring(0,3);return n?new Date(Date.UTC(r[1],i,r[3]||1,r[4]||0,r[5]||0,r[6]||0,s)):new Date(r[1],i,r[3]||1,r[4]||0,r[5]||0,r[6]||0,s)}}return new Date(e)}(t),this.$x=t.x||{},this.init();},$.init=function(){var t=this.$d;this.$y=t.getFullYear(),this.$M=t.getMonth(),this.$D=t.getDate(),this.$W=t.getDay(),this.$H=t.getHours(),this.$m=t.getMinutes(),this.$s=t.getSeconds(),this.$ms=t.getMilliseconds();},$.$utils=function(){return g},$.isValid=function(){return !("Invalid Date"===this.$d.toString())},$.isSame=function(t,e){var n=v(t);return this.startOf(e)<=n&&n<=this.endOf(e)},$.isAfter=function(t,e){return v(t)<this.startOf(e)},$.isBefore=function(t,e){return this.endOf(e)<v(t)},$.$g=function(t,e,n){return g.u(t)?this[e]:this.set(n,t)},$.unix=function(){return Math.floor(this.valueOf()/1e3)},$.valueOf=function(){return this.$d.getTime()},$.startOf=function(t,a){var h=this,c=!!g.u(a)||a,d=g.p(t),$=function(t,e){var n=g.w(h.$u?Date.UTC(h.$y,e,t):new Date(h.$y,e,t),h);return c?n:n.endOf(i)},l=function(t,e){return g.w(h.toDate()[t].apply(h.toDate("s"),(c?[0,0,0,0]:[23,59,59,999]).slice(e)),h)},y=this.$W,M=this.$M,m=this.$D,D="set"+(this.$u?"UTC":"");switch(d){case o:return c?$(1,0):$(31,11);case u:return c?$(1,M):$(0,M+1);case s:var v=this.$locale().weekStart||0,S=(y<v?y+7:y)-v;return $(c?m-S:m+(6-S),M);case i:case f:return l(D+"Hours",0);case r:return l(D+"Minutes",1);case n:return l(D+"Seconds",2);case e:return l(D+"Milliseconds",3);default:return this.clone()}},$.endOf=function(t){return this.startOf(t,!1)},$.$set=function(s,a){var h,c=g.p(s),d="set"+(this.$u?"UTC":""),$=(h={},h[i]=d+"Date",h[f]=d+"Date",h[u]=d+"Month",h[o]=d+"FullYear",h[r]=d+"Hours",h[n]=d+"Minutes",h[e]=d+"Seconds",h[t]=d+"Milliseconds",h)[c],l=c===i?this.$D+(a-this.$W):a;if(c===u||c===o){var y=this.clone().set(f,1);y.$d[$](l),y.init(),this.$d=y.set(f,Math.min(this.$D,y.daysInMonth())).$d;}else $&&this.$d[$](l);return this.init(),this},$.set=function(t,e){return this.clone().$set(t,e)},$.get=function(t){return this[g.p(t)]()},$.add=function(t,a){var f,h=this;t=Number(t);var c=g.p(a),d=function(e){var n=v(h);return g.w(n.date(n.date()+Math.round(e*t)),h)};if(c===u)return this.set(u,this.$M+t);if(c===o)return this.set(o,this.$y+t);if(c===i)return d(1);if(c===s)return d(7);var $=(f={},f[n]=6e4,f[r]=36e5,f[e]=1e3,f)[c]||1,l=this.$d.getTime()+t*$;return g.w(l,this)},$.subtract=function(t,e){return this.add(-1*t,e)},$.format=function(t){var e=this;if(!this.isValid())return "Invalid Date";var n=t||"YYYY-MM-DDTHH:mm:ssZ",r=g.z(this),i=this.$locale(),s=this.$H,u=this.$m,a=this.$M,o=i.weekdays,f=i.months,h=function(t,r,i,s){return t&&(t[r]||t(e,n))||i[r].substr(0,s)},d=function(t){return g.s(s%12||12,t,"0")},$=i.meridiem||function(t,e,n){var r=t<12?"AM":"PM";return n?r.toLowerCase():r},l={YY:String(this.$y).slice(-2),YYYY:this.$y,M:a+1,MM:g.s(a+1,2,"0"),MMM:h(i.monthsShort,a,f,3),MMMM:h(f,a),D:this.$D,DD:g.s(this.$D,2,"0"),d:String(this.$W),dd:h(i.weekdaysMin,this.$W,o,2),ddd:h(i.weekdaysShort,this.$W,o,3),dddd:o[this.$W],H:String(s),HH:g.s(s,2,"0"),h:d(1),hh:d(2),a:$(s,u,!0),A:$(s,u,!1),m:String(u),mm:g.s(u,2,"0"),s:String(this.$s),ss:g.s(this.$s,2,"0"),SSS:g.s(this.$ms,3,"0"),Z:r};return n.replace(c,function(t,e){return e||l[t]||r.replace(":","")})},$.utcOffset=function(){return 15*-Math.round(this.$d.getTimezoneOffset()/15)},$.diff=function(t,f,h){var c,d=g.p(f),$=v(t),l=6e4*($.utcOffset()-this.utcOffset()),y=this-$,M=g.m(this,$);return M=(c={},c[o]=M/12,c[u]=M,c[a]=M/3,c[s]=(y-l)/6048e5,c[i]=(y-l)/864e5,c[r]=y/36e5,c[n]=y/6e4,c[e]=y/1e3,c)[d]||y,h?M:g.a(M)},$.daysInMonth=function(){return this.endOf(u).$D},$.$locale=function(){return M[this.$L]},$.locale=function(t,e){if(!t)return this.$L;var n=this.clone(),r=D(t,e,!0);return r&&(n.$L=r),n},$.clone=function(){return g.w(this.$d,this)},$.toDate=function(){return new Date(this.valueOf())},$.toJSON=function(){return this.isValid()?this.toISOString():null},$.toISOString=function(){return this.$d.toISOString()},$.toString=function(){return this.$d.toUTCString()},d}(),p=S.prototype;return v.prototype=p,[["$ms",t],["$s",e],["$m",n],["$H",r],["$W",i],["$M",u],["$y",o],["$D",f]].forEach(function(t){p[t[1]]=function(e){return this.$g(e,t[0],t[1])};}),v.extend=function(t,e){return t(e,S,v),v},v.locale=D,v.isDayjs=m,v.unix=function(t){return v(1e3*t)},v.en=M[y],v.Ls=M,v});
    });

    const api = async (path, query = null, method = "GET", data = null) => {
        const resourceRow = (query) ? `${location.origin}/${path}?${query}` : `${location.origin}/${path}`;
        const resource = encodeURI(resourceRow);
        const init = {
            method,
            headers: {
                "Content-Type": "application/json",
            },
        };
        if (data)
            init.body = JSON.stringify(data);
        const response = await fetch(resource, init);
        return response;
    };
    const getFeed = async (rssUrl) => {
        const response = await api("rss-feed", `url=${rssUrl}`, "GET");
        const feed = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            url: "",
            title: "",
            description: "",
            link: "",
            contents: [],
        };
        const urlParse = new URL(response.url);
        feed.url = urlParse.searchParams.get("url");
        if (!response.ok)
            return feed;
        const result = await response.json();
        feed.title = result.title;
        feed.description = result.description;
        feed.link = result.link;
        const contents = result.contents.map((content) => (Object.assign(Object.assign({}, content), { date: dayjs_min(content.isoDate) })));
        feed.contents = contents;
        return feed;
    };
    const getFeeds = async (feedInfos) => {
        const promises = feedInfos.map((feedInfo) => getFeed(feedInfo.url));
        const feeds = await Promise.all(promises);
        return feeds;
    };
    const putFeedInfos = async (id, feedInfos) => {
        const response = await api("feed-infos", `id=${id}`, "PUT", { feedInfos });
        console.log(response.ok, response.status, response.statusText);
    };
    const getFeedInfos = async (id) => {
        const response = await api("feed-infos", `id=${id}`, "GET");
        if (!response.ok)
            throw new Error(`API error: ${response.url} ${response.status} ${response.statusText}`);
        const feedInfos = await response.json();
        return feedInfos;
    };

    /* src/component/FeedInfo.svelte generated by Svelte v3.29.0 */
    const file$1 = "src/component/FeedInfo.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[12] = list;
    	child_ctx[13] = i;
    	return child_ctx;
    }

    // (77:4) {:else}
    function create_else_block$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "×";
    			add_location(span, file$1, 77, 4, 2407);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(77:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (75:4) {#if valids[i]}
    function create_if_block$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "○";
    			add_location(span, file$1, 75, 4, 2376);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(75:4) {#if valids[i]}",
    		ctx
    	});

    	return block;
    }

    // (71:2) {#each feedInfos as feedInfo, i}
    function create_each_block(ctx) {
    	let div;
    	let input0;
    	let input0_name_value;
    	let t0;
    	let t1;
    	let input1;
    	let input1_name_value;
    	let mounted;
    	let dispose;

    	function input0_input_handler() {
    		/*input0_input_handler*/ ctx[6].call(input0, /*each_value*/ ctx[12], /*i*/ ctx[13]);
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*valids*/ ctx[1][/*i*/ ctx[13]]) return create_if_block$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			input0 = element("input");
    			t0 = space();
    			if_block.c();
    			t1 = space();
    			input1 = element("input");
    			attr_dev(input0, "type", "url");
    			attr_dev(input0, "name", input0_name_value = /*i*/ ctx[13]);
    			input0.required = true;
    			add_location(input0, file$1, 72, 4, 2288);
    			attr_dev(input1, "type", "button");
    			attr_dev(input1, "name", input1_name_value = /*i*/ ctx[13]);
    			input1.value = "削除";
    			add_location(input1, file$1, 80, 4, 2437);
    			attr_dev(div, "class", "feed-info svelte-1210cu9");
    			add_location(div, file$1, 71, 2, 2260);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, input0);
    			set_input_value(input0, /*feedInfo*/ ctx[11].url);
    			append_dev(div, t0);
    			if_block.m(div, null);
    			append_dev(div, t1);
    			append_dev(div, input1);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", input0_input_handler),
    					listen_dev(input1, "click", /*remove*/ ctx[3], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*feedInfos*/ 1) {
    				set_input_value(input0, /*feedInfo*/ ctx[11].url);
    			}

    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, t1);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(71:2) {#each feedInfos as feedInfo, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let form;
    	let t0;
    	let div;
    	let input0;
    	let t1;
    	let input1;
    	let t2;
    	let input2;
    	let mounted;
    	let dispose;
    	let each_value = /*feedInfos*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			form = element("form");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div = element("div");
    			input0 = element("input");
    			t1 = space();
    			input1 = element("input");
    			t2 = space();
    			input2 = element("input");
    			attr_dev(input0, "type", "button");
    			attr_dev(input0, "class", "nav-item svelte-1210cu9");
    			input0.value = "追加";
    			add_location(input0, file$1, 85, 4, 2541);
    			attr_dev(input1, "type", "button");
    			attr_dev(input1, "class", "nav-item svelte-1210cu9");
    			input1.value = "確定";
    			add_location(input1, file$1, 86, 4, 2610);
    			attr_dev(input2, "type", "button");
    			attr_dev(input2, "class", "nav-item svelte-1210cu9");
    			input2.value = "サーバーから読込";
    			add_location(input2, file$1, 87, 4, 2683);
    			attr_dev(div, "class", "nav svelte-1210cu9");
    			add_location(div, file$1, 84, 2, 2519);
    			add_location(form, file$1, 69, 0, 2216);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(form, null);
    			}

    			append_dev(form, t0);
    			append_dev(form, div);
    			append_dev(div, input0);
    			append_dev(div, t1);
    			append_dev(div, input1);
    			append_dev(div, t2);
    			append_dev(div, input2);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "click", /*add*/ ctx[2], false, false, false),
    					listen_dev(input1, "click", /*confirm*/ ctx[4], false, false, false),
    					listen_dev(input2, "click", /*getFeedInfos*/ ctx[5], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*remove, valids, feedInfos*/ 11) {
    				each_value = /*feedInfos*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(form, t0);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FeedInfo", slots, []);

    	var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
    		function adopt(value) {
    			return value instanceof P
    			? value
    			: new P(function (resolve) {
    						resolve(value);
    					});
    		}

    		return new (P || (P = Promise))(function (resolve, reject) {
    				function fulfilled(value) {
    					try {
    						step(generator.next(value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function rejected(value) {
    					try {
    						step(generator["throw"](value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function step(result) {
    					result.done
    					? resolve(result.value)
    					: adopt(result.value).then(fulfilled, rejected);
    				}

    				step((generator = generator.apply(thisArg, _arguments || [])).next());
    			});
    	};

    	
    	let { feedInfos = [] } = $$props;
    	let valids = feedInfos.map(() => true);
    	const dispatch = createEventDispatcher();

    	const add = () => {
    		$$invalidate(0, feedInfos = [...feedInfos, { id: "", url: "" }]);
    		$$invalidate(1, valids = [...valids, true]);
    	};

    	const remove = e => {
    		const removeIndex = parseInt(e.target.name, 10);
    		$$invalidate(0, feedInfos = feedInfos.filter((_, index) => index !== removeIndex));
    		$$invalidate(1, valids = valids.filter((_, index) => index !== removeIndex));
    	};

    	const checkValidation = feedInfos => __awaiter(void 0, void 0, void 0, function* () {
    		const feeds = yield getFeeds(feedInfos);
    		$$invalidate(1, valids = feeds.map(feed => feed.ok));
    	});

    	const isAllValid = () => {
    		return !valids.includes(false);
    	};

    	const confirm = () => __awaiter(void 0, void 0, void 0, function* () {
    		yield checkValidation(feedInfos);

    		if (isAllValid()) {
    			dispatch("exec", { payload: "confirm" });
    		} else {
    			alert("不適切なFeed情報があります。");
    		}
    	});

    	const getFeedInfos = () => {
    		dispatch("exec", { payload: "getFeedInfos" });
    	};

    	onMount(() => __awaiter(void 0, void 0, void 0, function* () {
    		yield checkValidation(feedInfos);
    	}));

    	const writable_props = ["feedInfos"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<FeedInfo> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler(each_value, i) {
    		each_value[i].url = this.value;
    		$$invalidate(0, feedInfos);
    	}

    	$$self.$$set = $$props => {
    		if ("feedInfos" in $$props) $$invalidate(0, feedInfos = $$props.feedInfos);
    	};

    	$$self.$capture_state = () => ({
    		__awaiter,
    		onMount,
    		createEventDispatcher,
    		getFeeds,
    		feedInfos,
    		valids,
    		dispatch,
    		add,
    		remove,
    		checkValidation,
    		isAllValid,
    		confirm,
    		getFeedInfos
    	});

    	$$self.$inject_state = $$props => {
    		if ("__awaiter" in $$props) __awaiter = $$props.__awaiter;
    		if ("feedInfos" in $$props) $$invalidate(0, feedInfos = $$props.feedInfos);
    		if ("valids" in $$props) $$invalidate(1, valids = $$props.valids);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [feedInfos, valids, add, remove, confirm, getFeedInfos, input0_input_handler];
    }

    class FeedInfo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { feedInfos: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FeedInfo",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get feedInfos() {
    		throw new Error("<FeedInfo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set feedInfos(value) {
    		throw new Error("<FeedInfo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/component/FeedList.svelte generated by Svelte v3.29.0 */

    const { Object: Object_1 } = globals;
    const file$2 = "src/component/FeedList.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (58:2) {:else}
    function create_else_block$2(ctx) {
    	let p;
    	let a;
    	let t0_value = /*feed*/ ctx[3].url + "";
    	let t0;
    	let a_href_value;
    	let t1;
    	let t2_value = /*feed*/ ctx[3].status + "";
    	let t2;
    	let t3;
    	let t4_value = /*feed*/ ctx[3].statusText + "";
    	let t4;

    	const block = {
    		c: function create() {
    			p = element("p");
    			a = element("a");
    			t0 = text(t0_value);
    			t1 = text(" [");
    			t2 = text(t2_value);
    			t3 = text("]");
    			t4 = text(t4_value);
    			attr_dev(a, "href", a_href_value = /*feed*/ ctx[3].url);
    			add_location(a, file$2, 58, 5, 1329);
    			add_location(p, file$2, 58, 2, 1326);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, a);
    			append_dev(a, t0);
    			append_dev(p, t1);
    			append_dev(p, t2);
    			append_dev(p, t3);
    			append_dev(p, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*feedsSorted*/ 1 && t0_value !== (t0_value = /*feed*/ ctx[3].url + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*feedsSorted*/ 1 && a_href_value !== (a_href_value = /*feed*/ ctx[3].url)) {
    				attr_dev(a, "href", a_href_value);
    			}

    			if (dirty & /*feedsSorted*/ 1 && t2_value !== (t2_value = /*feed*/ ctx[3].status + "")) set_data_dev(t2, t2_value);
    			if (dirty & /*feedsSorted*/ 1 && t4_value !== (t4_value = /*feed*/ ctx[3].statusText + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(58:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (39:2) {#if feed.ok}
    function create_if_block$2(ctx) {
    	let details;
    	let summary;
    	let t0_value = /*feed*/ ctx[3].title + "";
    	let t0;
    	let t1;
    	let a0;
    	let t2;
    	let a0_href_value;
    	let t3;
    	let a1;
    	let t4;
    	let a1_href_value;
    	let t5;
    	let t6;
    	let if_block = /*feed*/ ctx[3].description && create_if_block_1$1(ctx);
    	let each_value_1 = /*feed*/ ctx[3].contents;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			details = element("details");
    			summary = element("summary");
    			t0 = text(t0_value);
    			t1 = space();
    			a0 = element("a");
    			t2 = text("ホームページ");
    			t3 = space();
    			a1 = element("a");
    			t4 = text("フィードのリンク");
    			t5 = space();
    			if (if_block) if_block.c();
    			t6 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(summary, file$2, 40, 4, 764);
    			attr_dev(a0, "href", a0_href_value = /*feed*/ ctx[3].link);
    			attr_dev(a0, "target", "_blank");
    			attr_dev(a0, "rel", "noopener noreferrer");
    			add_location(a0, file$2, 42, 4, 801);
    			attr_dev(a1, "href", a1_href_value = /*feed*/ ctx[3].url);
    			attr_dev(a1, "target", "_blank");
    			attr_dev(a1, "rel", "noopener noreferrer");
    			add_location(a1, file$2, 43, 4, 878);
    			add_location(details, file$2, 39, 2, 750);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, details, anchor);
    			append_dev(details, summary);
    			append_dev(summary, t0);
    			append_dev(details, t1);
    			append_dev(details, a0);
    			append_dev(a0, t2);
    			append_dev(details, t3);
    			append_dev(details, a1);
    			append_dev(a1, t4);
    			append_dev(details, t5);
    			if (if_block) if_block.m(details, null);
    			append_dev(details, t6);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(details, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*feedsSorted*/ 1 && t0_value !== (t0_value = /*feed*/ ctx[3].title + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*feedsSorted*/ 1 && a0_href_value !== (a0_href_value = /*feed*/ ctx[3].link)) {
    				attr_dev(a0, "href", a0_href_value);
    			}

    			if (dirty & /*feedsSorted*/ 1 && a1_href_value !== (a1_href_value = /*feed*/ ctx[3].url)) {
    				attr_dev(a1, "href", a1_href_value);
    			}

    			if (/*feed*/ ctx[3].description) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$1(ctx);
    					if_block.c();
    					if_block.m(details, t6);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*feedsSorted*/ 1) {
    				each_value_1 = /*feed*/ ctx[3].contents;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(details, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(details);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(39:2) {#if feed.ok}",
    		ctx
    	});

    	return block;
    }

    // (46:4) {#if feed.description}
    function create_if_block_1$1(ctx) {
    	let p;
    	let t_value = /*feed*/ ctx[3].description + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			add_location(p, file$2, 46, 4, 984);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*feedsSorted*/ 1 && t_value !== (t_value = /*feed*/ ctx[3].description + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(46:4) {#if feed.description}",
    		ctx
    	});

    	return block;
    }

    // (50:4) {#each feed.contents as content}
    function create_each_block_1(ctx) {
    	let div;
    	let p0;
    	let a;
    	let t0_value = /*content*/ ctx[6].title + "";
    	let t0;
    	let a_href_value;
    	let t1;
    	let p1;
    	let t2_value = /*content*/ ctx[6].date.format("YYYY/MM/DD HH:mm") + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p0 = element("p");
    			a = element("a");
    			t0 = text(t0_value);
    			t1 = space();
    			p1 = element("p");
    			t2 = text(t2_value);
    			t3 = space();
    			attr_dev(a, "href", a_href_value = /*content*/ ctx[6].link);
    			attr_dev(a, "target", "_blank");
    			attr_dev(a, "rel", "noopener noreferrer");
    			add_location(a, file$2, 51, 36, 1120);
    			attr_dev(p0, "class", "content-item title svelte-fhl34u");
    			add_location(p0, file$2, 51, 6, 1090);
    			attr_dev(p1, "class", "date svelte-fhl34u");
    			add_location(p1, file$2, 52, 6, 1215);
    			attr_dev(div, "class", "content svelte-fhl34u");
    			add_location(div, file$2, 50, 4, 1062);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p0);
    			append_dev(p0, a);
    			append_dev(a, t0);
    			append_dev(div, t1);
    			append_dev(div, p1);
    			append_dev(p1, t2);
    			append_dev(div, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*feedsSorted*/ 1 && t0_value !== (t0_value = /*content*/ ctx[6].title + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*feedsSorted*/ 1 && a_href_value !== (a_href_value = /*content*/ ctx[6].link)) {
    				attr_dev(a, "href", a_href_value);
    			}

    			if (dirty & /*feedsSorted*/ 1 && t2_value !== (t2_value = /*content*/ ctx[6].date.format("YYYY/MM/DD HH:mm") + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(50:4) {#each feed.contents as content}",
    		ctx
    	});

    	return block;
    }

    // (37:0) {#each feedsSorted as feed}
    function create_each_block$1(ctx) {
    	let form;
    	let t;

    	function select_block_type(ctx, dirty) {
    		if (/*feed*/ ctx[3].ok) return create_if_block$2;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			form = element("form");
    			if_block.c();
    			t = space();
    			add_location(form, file$2, 37, 0, 725);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);
    			if_block.m(form, null);
    			append_dev(form, t);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(form, t);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(37:0) {#each feedsSorted as feed}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let each_1_anchor;
    	let each_value = /*feedsSorted*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*feedsSorted*/ 1) {
    				each_value = /*feedsSorted*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FeedList", slots, []);
    	
    	let { feeds = [] } = $$props;

    	const sortFeed = feed => {
    		const contensSorted = feed.contents.sort((a, b) => {
    			if (a.date.isBefore(b.date)) return 1;
    			if (b.date.isBefore(a.date)) return -1;
    			return 0;
    		});

    		return Object.assign(Object.assign({}, feed), { contents: contensSorted });
    	};

    	const writable_props = ["feeds"];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<FeedList> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("feeds" in $$props) $$invalidate(1, feeds = $$props.feeds);
    	};

    	$$self.$capture_state = () => ({ feeds, sortFeed, feedsSorted });

    	$$self.$inject_state = $$props => {
    		if ("feeds" in $$props) $$invalidate(1, feeds = $$props.feeds);
    		if ("feedsSorted" in $$props) $$invalidate(0, feedsSorted = $$props.feedsSorted);
    	};

    	let feedsSorted;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*feeds*/ 2) {
    			 $$invalidate(0, feedsSorted = feeds.map(feed => sortFeed(feed)));
    		}
    	};

    	return [feedsSorted, feeds];
    }

    class FeedList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { feeds: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FeedList",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get feeds() {
    		throw new Error("<FeedList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set feeds(value) {
    		throw new Error("<FeedList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __rest(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }

    function __decorate(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __param(paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    }

    function __metadata(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    }

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __createBinding(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }

    function __exportStar(m, exports) {
        for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
    }

    function __values(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    function __spreadArrays() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }
    function __await(v) {
        return this instanceof __await ? (this.v = v, this) : new __await(v);
    }

    function __asyncGenerator(thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
        function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    }

    function __asyncDelegator(o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
    }

    function __asyncValues(o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    }

    function __makeTemplateObject(cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    }
    function __importStar(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result.default = mod;
        return result;
    }

    function __importDefault(mod) {
        return (mod && mod.__esModule) ? mod : { default: mod };
    }

    function __classPrivateFieldGet(receiver, privateMap) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to get private field on non-instance");
        }
        return privateMap.get(receiver);
    }

    function __classPrivateFieldSet(receiver, privateMap, value) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to set private field on non-instance");
        }
        privateMap.set(receiver, value);
        return value;
    }

    var tslib_es6 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        __extends: __extends,
        get __assign () { return __assign; },
        __rest: __rest,
        __decorate: __decorate,
        __param: __param,
        __metadata: __metadata,
        __awaiter: __awaiter,
        __generator: __generator,
        __createBinding: __createBinding,
        __exportStar: __exportStar,
        __values: __values,
        __read: __read,
        __spread: __spread,
        __spreadArrays: __spreadArrays,
        __await: __await,
        __asyncGenerator: __asyncGenerator,
        __asyncDelegator: __asyncDelegator,
        __asyncValues: __asyncValues,
        __makeTemplateObject: __makeTemplateObject,
        __importStar: __importStar,
        __importDefault: __importDefault,
        __classPrivateFieldGet: __classPrivateFieldGet,
        __classPrivateFieldSet: __classPrivateFieldSet
    });

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics$1 = function(d, b) {
        extendStatics$1 = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics$1(d, b);
    };

    function __extends$1(d, b) {
        extendStatics$1(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign$1 = function() {
        __assign$1 = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign$1.apply(this, arguments);
    };

    function __rest$1(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }

    function __decorate$1(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __param$1(paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    }

    function __metadata$1(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    }

    function __awaiter$1(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator$1(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __createBinding$1(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }

    function __exportStar$1(m, exports) {
        for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
    }

    function __values$1(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    function __read$1(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread$1() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read$1(arguments[i]));
        return ar;
    }

    function __spreadArrays$1() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }
    function __await$1(v) {
        return this instanceof __await$1 ? (this.v = v, this) : new __await$1(v);
    }

    function __asyncGenerator$1(thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
        function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await$1 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    }

    function __asyncDelegator$1(o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$1(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
    }

    function __asyncValues$1(o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values$1 === "function" ? __values$1(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    }

    function __makeTemplateObject$1(cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    }
    function __importStar$1(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result.default = mod;
        return result;
    }

    function __importDefault$1(mod) {
        return (mod && mod.__esModule) ? mod : { default: mod };
    }

    function __classPrivateFieldGet$1(receiver, privateMap) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to get private field on non-instance");
        }
        return privateMap.get(receiver);
    }

    function __classPrivateFieldSet$1(receiver, privateMap, value) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to set private field on non-instance");
        }
        privateMap.set(receiver, value);
        return value;
    }

    var tslib_es6$1 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        __extends: __extends$1,
        get __assign () { return __assign$1; },
        __rest: __rest$1,
        __decorate: __decorate$1,
        __param: __param$1,
        __metadata: __metadata$1,
        __awaiter: __awaiter$1,
        __generator: __generator$1,
        __createBinding: __createBinding$1,
        __exportStar: __exportStar$1,
        __values: __values$1,
        __read: __read$1,
        __spread: __spread$1,
        __spreadArrays: __spreadArrays$1,
        __await: __await$1,
        __asyncGenerator: __asyncGenerator$1,
        __asyncDelegator: __asyncDelegator$1,
        __asyncValues: __asyncValues$1,
        __makeTemplateObject: __makeTemplateObject$1,
        __importStar: __importStar$1,
        __importDefault: __importDefault$1,
        __classPrivateFieldGet: __classPrivateFieldGet$1,
        __classPrivateFieldSet: __classPrivateFieldSet$1
    });

    var index_cjs = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', { value: true });



    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * @fileoverview Firebase constants.  Some of these (@defines) can be overridden at compile-time.
     */
    var CONSTANTS = {
        /**
         * @define {boolean} Whether this is the client Node.js SDK.
         */
        NODE_CLIENT: false,
        /**
         * @define {boolean} Whether this is the Admin Node.js SDK.
         */
        NODE_ADMIN: false,
        /**
         * Firebase SDK Version
         */
        SDK_VERSION: '${JSCORE_VERSION}'
    };

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Throws an error if the provided assertion is falsy
     */
    var assert = function (assertion, message) {
        if (!assertion) {
            throw assertionError(message);
        }
    };
    /**
     * Returns an Error object suitable for throwing.
     */
    var assertionError = function (message) {
        return new Error('Firebase Database (' +
            CONSTANTS.SDK_VERSION +
            ') INTERNAL ASSERT FAILED: ' +
            message);
    };

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var stringToByteArray = function (str) {
        // TODO(user): Use native implementations if/when available
        var out = [];
        var p = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 128) {
                out[p++] = c;
            }
            else if (c < 2048) {
                out[p++] = (c >> 6) | 192;
                out[p++] = (c & 63) | 128;
            }
            else if ((c & 0xfc00) === 0xd800 &&
                i + 1 < str.length &&
                (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                // Surrogate Pair
                c = 0x10000 + ((c & 0x03ff) << 10) + (str.charCodeAt(++i) & 0x03ff);
                out[p++] = (c >> 18) | 240;
                out[p++] = ((c >> 12) & 63) | 128;
                out[p++] = ((c >> 6) & 63) | 128;
                out[p++] = (c & 63) | 128;
            }
            else {
                out[p++] = (c >> 12) | 224;
                out[p++] = ((c >> 6) & 63) | 128;
                out[p++] = (c & 63) | 128;
            }
        }
        return out;
    };
    /**
     * Turns an array of numbers into the string given by the concatenation of the
     * characters to which the numbers correspond.
     * @param bytes Array of numbers representing characters.
     * @return Stringification of the array.
     */
    var byteArrayToString = function (bytes) {
        // TODO(user): Use native implementations if/when available
        var out = [];
        var pos = 0, c = 0;
        while (pos < bytes.length) {
            var c1 = bytes[pos++];
            if (c1 < 128) {
                out[c++] = String.fromCharCode(c1);
            }
            else if (c1 > 191 && c1 < 224) {
                var c2 = bytes[pos++];
                out[c++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
            }
            else if (c1 > 239 && c1 < 365) {
                // Surrogate Pair
                var c2 = bytes[pos++];
                var c3 = bytes[pos++];
                var c4 = bytes[pos++];
                var u = (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) -
                    0x10000;
                out[c++] = String.fromCharCode(0xd800 + (u >> 10));
                out[c++] = String.fromCharCode(0xdc00 + (u & 1023));
            }
            else {
                var c2 = bytes[pos++];
                var c3 = bytes[pos++];
                out[c++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            }
        }
        return out.join('');
    };
    // We define it as an object literal instead of a class because a class compiled down to es5 can't
    // be treeshaked. https://github.com/rollup/rollup/issues/1691
    // Static lookup maps, lazily populated by init_()
    var base64 = {
        /**
         * Maps bytes to characters.
         */
        byteToCharMap_: null,
        /**
         * Maps characters to bytes.
         */
        charToByteMap_: null,
        /**
         * Maps bytes to websafe characters.
         * @private
         */
        byteToCharMapWebSafe_: null,
        /**
         * Maps websafe characters to bytes.
         * @private
         */
        charToByteMapWebSafe_: null,
        /**
         * Our default alphabet, shared between
         * ENCODED_VALS and ENCODED_VALS_WEBSAFE
         */
        ENCODED_VALS_BASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789',
        /**
         * Our default alphabet. Value 64 (=) is special; it means "nothing."
         */
        get ENCODED_VALS() {
            return this.ENCODED_VALS_BASE + '+/=';
        },
        /**
         * Our websafe alphabet.
         */
        get ENCODED_VALS_WEBSAFE() {
            return this.ENCODED_VALS_BASE + '-_.';
        },
        /**
         * Whether this browser supports the atob and btoa functions. This extension
         * started at Mozilla but is now implemented by many browsers. We use the
         * ASSUME_* variables to avoid pulling in the full useragent detection library
         * but still allowing the standard per-browser compilations.
         *
         */
        HAS_NATIVE_SUPPORT: typeof atob === 'function',
        /**
         * Base64-encode an array of bytes.
         *
         * @param input An array of bytes (numbers with
         *     value in [0, 255]) to encode.
         * @param webSafe Boolean indicating we should use the
         *     alternative alphabet.
         * @return The base64 encoded string.
         */
        encodeByteArray: function (input, webSafe) {
            if (!Array.isArray(input)) {
                throw Error('encodeByteArray takes an array as a parameter');
            }
            this.init_();
            var byteToCharMap = webSafe
                ? this.byteToCharMapWebSafe_
                : this.byteToCharMap_;
            var output = [];
            for (var i = 0; i < input.length; i += 3) {
                var byte1 = input[i];
                var haveByte2 = i + 1 < input.length;
                var byte2 = haveByte2 ? input[i + 1] : 0;
                var haveByte3 = i + 2 < input.length;
                var byte3 = haveByte3 ? input[i + 2] : 0;
                var outByte1 = byte1 >> 2;
                var outByte2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
                var outByte3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
                var outByte4 = byte3 & 0x3f;
                if (!haveByte3) {
                    outByte4 = 64;
                    if (!haveByte2) {
                        outByte3 = 64;
                    }
                }
                output.push(byteToCharMap[outByte1], byteToCharMap[outByte2], byteToCharMap[outByte3], byteToCharMap[outByte4]);
            }
            return output.join('');
        },
        /**
         * Base64-encode a string.
         *
         * @param input A string to encode.
         * @param webSafe If true, we should use the
         *     alternative alphabet.
         * @return The base64 encoded string.
         */
        encodeString: function (input, webSafe) {
            // Shortcut for Mozilla browsers that implement
            // a native base64 encoder in the form of "btoa/atob"
            if (this.HAS_NATIVE_SUPPORT && !webSafe) {
                return btoa(input);
            }
            return this.encodeByteArray(stringToByteArray(input), webSafe);
        },
        /**
         * Base64-decode a string.
         *
         * @param input to decode.
         * @param webSafe True if we should use the
         *     alternative alphabet.
         * @return string representing the decoded value.
         */
        decodeString: function (input, webSafe) {
            // Shortcut for Mozilla browsers that implement
            // a native base64 encoder in the form of "btoa/atob"
            if (this.HAS_NATIVE_SUPPORT && !webSafe) {
                return atob(input);
            }
            return byteArrayToString(this.decodeStringToByteArray(input, webSafe));
        },
        /**
         * Base64-decode a string.
         *
         * In base-64 decoding, groups of four characters are converted into three
         * bytes.  If the encoder did not apply padding, the input length may not
         * be a multiple of 4.
         *
         * In this case, the last group will have fewer than 4 characters, and
         * padding will be inferred.  If the group has one or two characters, it decodes
         * to one byte.  If the group has three characters, it decodes to two bytes.
         *
         * @param input Input to decode.
         * @param webSafe True if we should use the web-safe alphabet.
         * @return bytes representing the decoded value.
         */
        decodeStringToByteArray: function (input, webSafe) {
            this.init_();
            var charToByteMap = webSafe
                ? this.charToByteMapWebSafe_
                : this.charToByteMap_;
            var output = [];
            for (var i = 0; i < input.length;) {
                var byte1 = charToByteMap[input.charAt(i++)];
                var haveByte2 = i < input.length;
                var byte2 = haveByte2 ? charToByteMap[input.charAt(i)] : 0;
                ++i;
                var haveByte3 = i < input.length;
                var byte3 = haveByte3 ? charToByteMap[input.charAt(i)] : 64;
                ++i;
                var haveByte4 = i < input.length;
                var byte4 = haveByte4 ? charToByteMap[input.charAt(i)] : 64;
                ++i;
                if (byte1 == null || byte2 == null || byte3 == null || byte4 == null) {
                    throw Error();
                }
                var outByte1 = (byte1 << 2) | (byte2 >> 4);
                output.push(outByte1);
                if (byte3 !== 64) {
                    var outByte2 = ((byte2 << 4) & 0xf0) | (byte3 >> 2);
                    output.push(outByte2);
                    if (byte4 !== 64) {
                        var outByte3 = ((byte3 << 6) & 0xc0) | byte4;
                        output.push(outByte3);
                    }
                }
            }
            return output;
        },
        /**
         * Lazy static initialization function. Called before
         * accessing any of the static map variables.
         * @private
         */
        init_: function () {
            if (!this.byteToCharMap_) {
                this.byteToCharMap_ = {};
                this.charToByteMap_ = {};
                this.byteToCharMapWebSafe_ = {};
                this.charToByteMapWebSafe_ = {};
                // We want quick mappings back and forth, so we precompute two maps.
                for (var i = 0; i < this.ENCODED_VALS.length; i++) {
                    this.byteToCharMap_[i] = this.ENCODED_VALS.charAt(i);
                    this.charToByteMap_[this.byteToCharMap_[i]] = i;
                    this.byteToCharMapWebSafe_[i] = this.ENCODED_VALS_WEBSAFE.charAt(i);
                    this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[i]] = i;
                    // Be forgiving when decoding and correctly decode both encodings.
                    if (i >= this.ENCODED_VALS_BASE.length) {
                        this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(i)] = i;
                        this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(i)] = i;
                    }
                }
            }
        }
    };
    /**
     * URL-safe base64 encoding
     */
    var base64Encode = function (str) {
        var utf8Bytes = stringToByteArray(str);
        return base64.encodeByteArray(utf8Bytes, true);
    };
    /**
     * URL-safe base64 decoding
     *
     * NOTE: DO NOT use the global atob() function - it does NOT support the
     * base64Url variant encoding.
     *
     * @param str To be decoded
     * @return Decoded result, if possible
     */
    var base64Decode = function (str) {
        try {
            return base64.decodeString(str, true);
        }
        catch (e) {
            console.error('base64Decode failed: ', e);
        }
        return null;
    };

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Do a deep-copy of basic JavaScript Objects or Arrays.
     */
    function deepCopy(value) {
        return deepExtend(undefined, value);
    }
    /**
     * Copy properties from source to target (recursively allows extension
     * of Objects and Arrays).  Scalar values in the target are over-written.
     * If target is undefined, an object of the appropriate type will be created
     * (and returned).
     *
     * We recursively copy all child properties of plain Objects in the source- so
     * that namespace- like dictionaries are merged.
     *
     * Note that the target can be a function, in which case the properties in
     * the source Object are copied onto it as static properties of the Function.
     */
    function deepExtend(target, source) {
        if (!(source instanceof Object)) {
            return source;
        }
        switch (source.constructor) {
            case Date:
                // Treat Dates like scalars; if the target date object had any child
                // properties - they will be lost!
                var dateValue = source;
                return new Date(dateValue.getTime());
            case Object:
                if (target === undefined) {
                    target = {};
                }
                break;
            case Array:
                // Always copy the array source and overwrite the target.
                target = [];
                break;
            default:
                // Not a plain Object - treat it as a scalar.
                return source;
        }
        for (var prop in source) {
            if (!source.hasOwnProperty(prop)) {
                continue;
            }
            target[prop] = deepExtend(target[prop], source[prop]);
        }
        return target;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var Deferred = /** @class */ (function () {
        function Deferred() {
            var _this = this;
            this.reject = function () { };
            this.resolve = function () { };
            this.promise = new Promise(function (resolve, reject) {
                _this.resolve = resolve;
                _this.reject = reject;
            });
        }
        /**
         * Our API internals are not promiseified and cannot because our callback APIs have subtle expectations around
         * invoking promises inline, which Promises are forbidden to do. This method accepts an optional node-style callback
         * and returns a node-style callback which will resolve or reject the Deferred's promise.
         */
        Deferred.prototype.wrapCallback = function (callback) {
            var _this = this;
            return function (error, value) {
                if (error) {
                    _this.reject(error);
                }
                else {
                    _this.resolve(value);
                }
                if (typeof callback === 'function') {
                    // Attaching noop handler just in case developer wasn't expecting
                    // promises
                    _this.promise.catch(function () { });
                    // Some of our callbacks don't expect a value and our own tests
                    // assert that the parameter length is 1
                    if (callback.length === 1) {
                        callback(error);
                    }
                    else {
                        callback(error, value);
                    }
                }
            };
        };
        return Deferred;
    }());

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Returns navigator.userAgent string or '' if it's not defined.
     * @return user agent string
     */
    function getUA() {
        if (typeof navigator !== 'undefined' &&
            typeof navigator['userAgent'] === 'string') {
            return navigator['userAgent'];
        }
        else {
            return '';
        }
    }
    /**
     * Detect Cordova / PhoneGap / Ionic frameworks on a mobile device.
     *
     * Deliberately does not rely on checking `file://` URLs (as this fails PhoneGap
     * in the Ripple emulator) nor Cordova `onDeviceReady`, which would normally
     * wait for a callback.
     */
    function isMobileCordova() {
        return (typeof window !== 'undefined' &&
            // @ts-ignore Setting up an broadly applicable index signature for Window
            // just to deal with this case would probably be a bad idea.
            !!(window['cordova'] || window['phonegap'] || window['PhoneGap']) &&
            /ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(getUA()));
    }
    /**
     * Detect Node.js.
     *
     * @return true if Node.js environment is detected.
     */
    // Node detection logic from: https://github.com/iliakan/detect-node/
    function isNode() {
        try {
            return (Object.prototype.toString.call(commonjsGlobal.process) === '[object process]');
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Detect Browser Environment
     */
    function isBrowser() {
        return typeof self === 'object' && self.self === self;
    }
    function isBrowserExtension() {
        var runtime = typeof chrome === 'object'
            ? chrome.runtime
            : typeof browser === 'object'
                ? browser.runtime
                : undefined;
        return typeof runtime === 'object' && runtime.id !== undefined;
    }
    /**
     * Detect React Native.
     *
     * @return true if ReactNative environment is detected.
     */
    function isReactNative() {
        return (typeof navigator === 'object' && navigator['product'] === 'ReactNative');
    }
    /** Detects Electron apps. */
    function isElectron() {
        return getUA().indexOf('Electron/') >= 0;
    }
    /** Detects Internet Explorer. */
    function isIE() {
        var ua = getUA();
        return ua.indexOf('MSIE ') >= 0 || ua.indexOf('Trident/') >= 0;
    }
    /** Detects Universal Windows Platform apps. */
    function isUWP() {
        return getUA().indexOf('MSAppHost/') >= 0;
    }
    /**
     * Detect whether the current SDK build is the Node version.
     *
     * @return true if it's the Node SDK build.
     */
    function isNodeSdk() {
        return CONSTANTS.NODE_CLIENT === true || CONSTANTS.NODE_ADMIN === true;
    }
    /** Returns true if we are running in Safari. */
    function isSafari() {
        return (!isNode() &&
            navigator.userAgent.includes('Safari') &&
            !navigator.userAgent.includes('Chrome'));
    }
    /**
     * This method checks if indexedDB is supported by current browser/service worker context
     * @return true if indexedDB is supported by current browser/service worker context
     */
    function isIndexedDBAvailable() {
        return 'indexedDB' in self && indexedDB != null;
    }
    /**
     * This method validates browser context for indexedDB by opening a dummy indexedDB database and reject
     * if errors occur during the database open operation.
     */
    function validateIndexedDBOpenable() {
        return new Promise(function (resolve, reject) {
            try {
                var preExist_1 = true;
                var DB_CHECK_NAME_1 = 'validate-browser-context-for-indexeddb-analytics-module';
                var request_1 = window.indexedDB.open(DB_CHECK_NAME_1);
                request_1.onsuccess = function () {
                    request_1.result.close();
                    // delete database only when it doesn't pre-exist
                    if (!preExist_1) {
                        window.indexedDB.deleteDatabase(DB_CHECK_NAME_1);
                    }
                    resolve(true);
                };
                request_1.onupgradeneeded = function () {
                    preExist_1 = false;
                };
                request_1.onerror = function () {
                    var _a;
                    reject(((_a = request_1.error) === null || _a === void 0 ? void 0 : _a.message) || '');
                };
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     *
     * This method checks whether cookie is enabled within current browser
     * @return true if cookie is enabled within current browser
     */
    function areCookiesEnabled() {
        if (!navigator || !navigator.cookieEnabled) {
            return false;
        }
        return true;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var ERROR_NAME = 'FirebaseError';
    // Based on code from:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Custom_Error_Types
    var FirebaseError = /** @class */ (function (_super) {
        tslib_es6$1.__extends(FirebaseError, _super);
        function FirebaseError(code, message) {
            var _this = _super.call(this, message) || this;
            _this.code = code;
            _this.name = ERROR_NAME;
            // Fix For ES5
            // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
            Object.setPrototypeOf(_this, FirebaseError.prototype);
            // Maintains proper stack trace for where our error was thrown.
            // Only available on V8.
            if (Error.captureStackTrace) {
                Error.captureStackTrace(_this, ErrorFactory.prototype.create);
            }
            return _this;
        }
        return FirebaseError;
    }(Error));
    var ErrorFactory = /** @class */ (function () {
        function ErrorFactory(service, serviceName, errors) {
            this.service = service;
            this.serviceName = serviceName;
            this.errors = errors;
        }
        ErrorFactory.prototype.create = function (code) {
            var data = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                data[_i - 1] = arguments[_i];
            }
            var customData = data[0] || {};
            var fullCode = this.service + "/" + code;
            var template = this.errors[code];
            var message = template ? replaceTemplate(template, customData) : 'Error';
            // Service Name: Error message (service/code).
            var fullMessage = this.serviceName + ": " + message + " (" + fullCode + ").";
            var error = new FirebaseError(fullCode, fullMessage);
            // Keys with an underscore at the end of their name are not included in
            // error.data for some reason.
            // TODO: Replace with Object.entries when lib is updated to es2017.
            for (var _a = 0, _b = Object.keys(customData); _a < _b.length; _a++) {
                var key = _b[_a];
                if (key.slice(-1) !== '_') {
                    if (key in error) {
                        console.warn("Overwriting FirebaseError base field \"" + key + "\" can cause unexpected behavior.");
                    }
                    error[key] = customData[key];
                }
            }
            return error;
        };
        return ErrorFactory;
    }());
    function replaceTemplate(template, data) {
        return template.replace(PATTERN, function (_, key) {
            var value = data[key];
            return value != null ? String(value) : "<" + key + "?>";
        });
    }
    var PATTERN = /\{\$([^}]+)}/g;

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Evaluates a JSON string into a javascript object.
     *
     * @param {string} str A string containing JSON.
     * @return {*} The javascript object representing the specified JSON.
     */
    function jsonEval(str) {
        return JSON.parse(str);
    }
    /**
     * Returns JSON representing a javascript object.
     * @param {*} data Javascript object to be stringified.
     * @return {string} The JSON contents of the object.
     */
    function stringify(data) {
        return JSON.stringify(data);
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Decodes a Firebase auth. token into constituent parts.
     *
     * Notes:
     * - May return with invalid / incomplete claims if there's no native base64 decoding support.
     * - Doesn't check if the token is actually valid.
     */
    var decode = function (token) {
        var header = {}, claims = {}, data = {}, signature = '';
        try {
            var parts = token.split('.');
            header = jsonEval(base64Decode(parts[0]) || '');
            claims = jsonEval(base64Decode(parts[1]) || '');
            signature = parts[2];
            data = claims['d'] || {};
            delete claims['d'];
        }
        catch (e) { }
        return {
            header: header,
            claims: claims,
            data: data,
            signature: signature
        };
    };
    /**
     * Decodes a Firebase auth. token and checks the validity of its time-based claims. Will return true if the
     * token is within the time window authorized by the 'nbf' (not-before) and 'iat' (issued-at) claims.
     *
     * Notes:
     * - May return a false negative if there's no native base64 decoding support.
     * - Doesn't check if the token is actually valid.
     */
    var isValidTimestamp = function (token) {
        var claims = decode(token).claims;
        var now = Math.floor(new Date().getTime() / 1000);
        var validSince = 0, validUntil = 0;
        if (typeof claims === 'object') {
            if (claims.hasOwnProperty('nbf')) {
                validSince = claims['nbf'];
            }
            else if (claims.hasOwnProperty('iat')) {
                validSince = claims['iat'];
            }
            if (claims.hasOwnProperty('exp')) {
                validUntil = claims['exp'];
            }
            else {
                // token will expire after 24h by default
                validUntil = validSince + 86400;
            }
        }
        return (!!now &&
            !!validSince &&
            !!validUntil &&
            now >= validSince &&
            now <= validUntil);
    };
    /**
     * Decodes a Firebase auth. token and returns its issued at time if valid, null otherwise.
     *
     * Notes:
     * - May return null if there's no native base64 decoding support.
     * - Doesn't check if the token is actually valid.
     */
    var issuedAtTime = function (token) {
        var claims = decode(token).claims;
        if (typeof claims === 'object' && claims.hasOwnProperty('iat')) {
            return claims['iat'];
        }
        return null;
    };
    /**
     * Decodes a Firebase auth. token and checks the validity of its format. Expects a valid issued-at time.
     *
     * Notes:
     * - May return a false negative if there's no native base64 decoding support.
     * - Doesn't check if the token is actually valid.
     */
    var isValidFormat = function (token) {
        var decoded = decode(token), claims = decoded.claims;
        return !!claims && typeof claims === 'object' && claims.hasOwnProperty('iat');
    };
    /**
     * Attempts to peer into an auth token and determine if it's an admin auth token by looking at the claims portion.
     *
     * Notes:
     * - May return a false negative if there's no native base64 decoding support.
     * - Doesn't check if the token is actually valid.
     */
    var isAdmin = function (token) {
        var claims = decode(token).claims;
        return typeof claims === 'object' && claims['admin'] === true;
    };

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    function contains(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }
    function safeGet(obj, key) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return obj[key];
        }
        else {
            return undefined;
        }
    }
    function isEmpty(obj) {
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                return false;
            }
        }
        return true;
    }
    function map(obj, fn, contextObj) {
        var res = {};
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                res[key] = fn.call(contextObj, obj[key], key, obj);
            }
        }
        return res;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Returns a querystring-formatted string (e.g. &arg=val&arg2=val2) from a
     * params object (e.g. {arg: 'val', arg2: 'val2'})
     * Note: You must prepend it with ? when adding it to a URL.
     */
    function querystring(querystringParams) {
        var params = [];
        var _loop_1 = function (key, value) {
            if (Array.isArray(value)) {
                value.forEach(function (arrayVal) {
                    params.push(encodeURIComponent(key) + '=' + encodeURIComponent(arrayVal));
                });
            }
            else {
                params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            }
        };
        for (var _i = 0, _a = Object.entries(querystringParams); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            _loop_1(key, value);
        }
        return params.length ? '&' + params.join('&') : '';
    }
    /**
     * Decodes a querystring (e.g. ?arg=val&arg2=val2) into a params object
     * (e.g. {arg: 'val', arg2: 'val2'})
     */
    function querystringDecode(querystring) {
        var obj = {};
        var tokens = querystring.replace(/^\?/, '').split('&');
        tokens.forEach(function (token) {
            if (token) {
                var key = token.split('=');
                obj[key[0]] = key[1];
            }
        });
        return obj;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * @fileoverview SHA-1 cryptographic hash.
     * Variable names follow the notation in FIPS PUB 180-3:
     * http://csrc.nist.gov/publications/fips/fips180-3/fips180-3_final.pdf.
     *
     * Usage:
     *   var sha1 = new sha1();
     *   sha1.update(bytes);
     *   var hash = sha1.digest();
     *
     * Performance:
     *   Chrome 23:   ~400 Mbit/s
     *   Firefox 16:  ~250 Mbit/s
     *
     */
    /**
     * SHA-1 cryptographic hash constructor.
     *
     * The properties declared here are discussed in the above algorithm document.
     * @constructor
     * @final
     * @struct
     */
    var Sha1 = /** @class */ (function () {
        function Sha1() {
            /**
             * Holds the previous values of accumulated variables a-e in the compress_
             * function.
             * @private
             */
            this.chain_ = [];
            /**
             * A buffer holding the partially computed hash result.
             * @private
             */
            this.buf_ = [];
            /**
             * An array of 80 bytes, each a part of the message to be hashed.  Referred to
             * as the message schedule in the docs.
             * @private
             */
            this.W_ = [];
            /**
             * Contains data needed to pad messages less than 64 bytes.
             * @private
             */
            this.pad_ = [];
            /**
             * @private {number}
             */
            this.inbuf_ = 0;
            /**
             * @private {number}
             */
            this.total_ = 0;
            this.blockSize = 512 / 8;
            this.pad_[0] = 128;
            for (var i = 1; i < this.blockSize; ++i) {
                this.pad_[i] = 0;
            }
            this.reset();
        }
        Sha1.prototype.reset = function () {
            this.chain_[0] = 0x67452301;
            this.chain_[1] = 0xefcdab89;
            this.chain_[2] = 0x98badcfe;
            this.chain_[3] = 0x10325476;
            this.chain_[4] = 0xc3d2e1f0;
            this.inbuf_ = 0;
            this.total_ = 0;
        };
        /**
         * Internal compress helper function.
         * @param buf Block to compress.
         * @param offset Offset of the block in the buffer.
         * @private
         */
        Sha1.prototype.compress_ = function (buf, offset) {
            if (!offset) {
                offset = 0;
            }
            var W = this.W_;
            // get 16 big endian words
            if (typeof buf === 'string') {
                for (var i = 0; i < 16; i++) {
                    // TODO(user): [bug 8140122] Recent versions of Safari for Mac OS and iOS
                    // have a bug that turns the post-increment ++ operator into pre-increment
                    // during JIT compilation.  We have code that depends heavily on SHA-1 for
                    // correctness and which is affected by this bug, so I've removed all uses
                    // of post-increment ++ in which the result value is used.  We can revert
                    // this change once the Safari bug
                    // (https://bugs.webkit.org/show_bug.cgi?id=109036) has been fixed and
                    // most clients have been updated.
                    W[i] =
                        (buf.charCodeAt(offset) << 24) |
                            (buf.charCodeAt(offset + 1) << 16) |
                            (buf.charCodeAt(offset + 2) << 8) |
                            buf.charCodeAt(offset + 3);
                    offset += 4;
                }
            }
            else {
                for (var i = 0; i < 16; i++) {
                    W[i] =
                        (buf[offset] << 24) |
                            (buf[offset + 1] << 16) |
                            (buf[offset + 2] << 8) |
                            buf[offset + 3];
                    offset += 4;
                }
            }
            // expand to 80 words
            for (var i = 16; i < 80; i++) {
                var t = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
                W[i] = ((t << 1) | (t >>> 31)) & 0xffffffff;
            }
            var a = this.chain_[0];
            var b = this.chain_[1];
            var c = this.chain_[2];
            var d = this.chain_[3];
            var e = this.chain_[4];
            var f, k;
            // TODO(user): Try to unroll this loop to speed up the computation.
            for (var i = 0; i < 80; i++) {
                if (i < 40) {
                    if (i < 20) {
                        f = d ^ (b & (c ^ d));
                        k = 0x5a827999;
                    }
                    else {
                        f = b ^ c ^ d;
                        k = 0x6ed9eba1;
                    }
                }
                else {
                    if (i < 60) {
                        f = (b & c) | (d & (b | c));
                        k = 0x8f1bbcdc;
                    }
                    else {
                        f = b ^ c ^ d;
                        k = 0xca62c1d6;
                    }
                }
                var t = (((a << 5) | (a >>> 27)) + f + e + k + W[i]) & 0xffffffff;
                e = d;
                d = c;
                c = ((b << 30) | (b >>> 2)) & 0xffffffff;
                b = a;
                a = t;
            }
            this.chain_[0] = (this.chain_[0] + a) & 0xffffffff;
            this.chain_[1] = (this.chain_[1] + b) & 0xffffffff;
            this.chain_[2] = (this.chain_[2] + c) & 0xffffffff;
            this.chain_[3] = (this.chain_[3] + d) & 0xffffffff;
            this.chain_[4] = (this.chain_[4] + e) & 0xffffffff;
        };
        Sha1.prototype.update = function (bytes, length) {
            // TODO(johnlenz): tighten the function signature and remove this check
            if (bytes == null) {
                return;
            }
            if (length === undefined) {
                length = bytes.length;
            }
            var lengthMinusBlock = length - this.blockSize;
            var n = 0;
            // Using local instead of member variables gives ~5% speedup on Firefox 16.
            var buf = this.buf_;
            var inbuf = this.inbuf_;
            // The outer while loop should execute at most twice.
            while (n < length) {
                // When we have no data in the block to top up, we can directly process the
                // input buffer (assuming it contains sufficient data). This gives ~25%
                // speedup on Chrome 23 and ~15% speedup on Firefox 16, but requires that
                // the data is provided in large chunks (or in multiples of 64 bytes).
                if (inbuf === 0) {
                    while (n <= lengthMinusBlock) {
                        this.compress_(bytes, n);
                        n += this.blockSize;
                    }
                }
                if (typeof bytes === 'string') {
                    while (n < length) {
                        buf[inbuf] = bytes.charCodeAt(n);
                        ++inbuf;
                        ++n;
                        if (inbuf === this.blockSize) {
                            this.compress_(buf);
                            inbuf = 0;
                            // Jump to the outer loop so we use the full-block optimization.
                            break;
                        }
                    }
                }
                else {
                    while (n < length) {
                        buf[inbuf] = bytes[n];
                        ++inbuf;
                        ++n;
                        if (inbuf === this.blockSize) {
                            this.compress_(buf);
                            inbuf = 0;
                            // Jump to the outer loop so we use the full-block optimization.
                            break;
                        }
                    }
                }
            }
            this.inbuf_ = inbuf;
            this.total_ += length;
        };
        /** @override */
        Sha1.prototype.digest = function () {
            var digest = [];
            var totalBits = this.total_ * 8;
            // Add pad 0x80 0x00*.
            if (this.inbuf_ < 56) {
                this.update(this.pad_, 56 - this.inbuf_);
            }
            else {
                this.update(this.pad_, this.blockSize - (this.inbuf_ - 56));
            }
            // Add # bits.
            for (var i = this.blockSize - 1; i >= 56; i--) {
                this.buf_[i] = totalBits & 255;
                totalBits /= 256; // Don't use bit-shifting here!
            }
            this.compress_(this.buf_);
            var n = 0;
            for (var i = 0; i < 5; i++) {
                for (var j = 24; j >= 0; j -= 8) {
                    digest[n] = (this.chain_[i] >> j) & 255;
                    ++n;
                }
            }
            return digest;
        };
        return Sha1;
    }());

    /**
     * Helper to make a Subscribe function (just like Promise helps make a
     * Thenable).
     *
     * @param executor Function which can make calls to a single Observer
     *     as a proxy.
     * @param onNoObservers Callback when count of Observers goes to zero.
     */
    function createSubscribe(executor, onNoObservers) {
        var proxy = new ObserverProxy(executor, onNoObservers);
        return proxy.subscribe.bind(proxy);
    }
    /**
     * Implement fan-out for any number of Observers attached via a subscribe
     * function.
     */
    var ObserverProxy = /** @class */ (function () {
        /**
         * @param executor Function which can make calls to a single Observer
         *     as a proxy.
         * @param onNoObservers Callback when count of Observers goes to zero.
         */
        function ObserverProxy(executor, onNoObservers) {
            var _this = this;
            this.observers = [];
            this.unsubscribes = [];
            this.observerCount = 0;
            // Micro-task scheduling by calling task.then().
            this.task = Promise.resolve();
            this.finalized = false;
            this.onNoObservers = onNoObservers;
            // Call the executor asynchronously so subscribers that are called
            // synchronously after the creation of the subscribe function
            // can still receive the very first value generated in the executor.
            this.task
                .then(function () {
                executor(_this);
            })
                .catch(function (e) {
                _this.error(e);
            });
        }
        ObserverProxy.prototype.next = function (value) {
            this.forEachObserver(function (observer) {
                observer.next(value);
            });
        };
        ObserverProxy.prototype.error = function (error) {
            this.forEachObserver(function (observer) {
                observer.error(error);
            });
            this.close(error);
        };
        ObserverProxy.prototype.complete = function () {
            this.forEachObserver(function (observer) {
                observer.complete();
            });
            this.close();
        };
        /**
         * Subscribe function that can be used to add an Observer to the fan-out list.
         *
         * - We require that no event is sent to a subscriber sychronously to their
         *   call to subscribe().
         */
        ObserverProxy.prototype.subscribe = function (nextOrObserver, error, complete) {
            var _this = this;
            var observer;
            if (nextOrObserver === undefined &&
                error === undefined &&
                complete === undefined) {
                throw new Error('Missing Observer.');
            }
            // Assemble an Observer object when passed as callback functions.
            if (implementsAnyMethods(nextOrObserver, [
                'next',
                'error',
                'complete'
            ])) {
                observer = nextOrObserver;
            }
            else {
                observer = {
                    next: nextOrObserver,
                    error: error,
                    complete: complete
                };
            }
            if (observer.next === undefined) {
                observer.next = noop;
            }
            if (observer.error === undefined) {
                observer.error = noop;
            }
            if (observer.complete === undefined) {
                observer.complete = noop;
            }
            var unsub = this.unsubscribeOne.bind(this, this.observers.length);
            // Attempt to subscribe to a terminated Observable - we
            // just respond to the Observer with the final error or complete
            // event.
            if (this.finalized) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.task.then(function () {
                    try {
                        if (_this.finalError) {
                            observer.error(_this.finalError);
                        }
                        else {
                            observer.complete();
                        }
                    }
                    catch (e) {
                        // nothing
                    }
                    return;
                });
            }
            this.observers.push(observer);
            return unsub;
        };
        // Unsubscribe is synchronous - we guarantee that no events are sent to
        // any unsubscribed Observer.
        ObserverProxy.prototype.unsubscribeOne = function (i) {
            if (this.observers === undefined || this.observers[i] === undefined) {
                return;
            }
            delete this.observers[i];
            this.observerCount -= 1;
            if (this.observerCount === 0 && this.onNoObservers !== undefined) {
                this.onNoObservers(this);
            }
        };
        ObserverProxy.prototype.forEachObserver = function (fn) {
            if (this.finalized) {
                // Already closed by previous event....just eat the additional values.
                return;
            }
            // Since sendOne calls asynchronously - there is no chance that
            // this.observers will become undefined.
            for (var i = 0; i < this.observers.length; i++) {
                this.sendOne(i, fn);
            }
        };
        // Call the Observer via one of it's callback function. We are careful to
        // confirm that the observe has not been unsubscribed since this asynchronous
        // function had been queued.
        ObserverProxy.prototype.sendOne = function (i, fn) {
            var _this = this;
            // Execute the callback asynchronously
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.task.then(function () {
                if (_this.observers !== undefined && _this.observers[i] !== undefined) {
                    try {
                        fn(_this.observers[i]);
                    }
                    catch (e) {
                        // Ignore exceptions raised in Observers or missing methods of an
                        // Observer.
                        // Log error to console. b/31404806
                        if (typeof console !== 'undefined' && console.error) {
                            console.error(e);
                        }
                    }
                }
            });
        };
        ObserverProxy.prototype.close = function (err) {
            var _this = this;
            if (this.finalized) {
                return;
            }
            this.finalized = true;
            if (err !== undefined) {
                this.finalError = err;
            }
            // Proxy is no longer needed - garbage collect references
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.task.then(function () {
                _this.observers = undefined;
                _this.onNoObservers = undefined;
            });
        };
        return ObserverProxy;
    }());
    /** Turn synchronous function into one called asynchronously. */
    // eslint-disable-next-line @typescript-eslint/ban-types
    function async(fn, onError) {
        return function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            Promise.resolve(true)
                .then(function () {
                fn.apply(void 0, args);
            })
                .catch(function (error) {
                if (onError) {
                    onError(error);
                }
            });
        };
    }
    /**
     * Return true if the object passed in implements any of the named methods.
     */
    function implementsAnyMethods(obj, methods) {
        if (typeof obj !== 'object' || obj === null) {
            return false;
        }
        for (var _i = 0, methods_1 = methods; _i < methods_1.length; _i++) {
            var method = methods_1[_i];
            if (method in obj && typeof obj[method] === 'function') {
                return true;
            }
        }
        return false;
    }
    function noop() {
        // do nothing
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Check to make sure the appropriate number of arguments are provided for a public function.
     * Throws an error if it fails.
     *
     * @param fnName The function name
     * @param minCount The minimum number of arguments to allow for the function call
     * @param maxCount The maximum number of argument to allow for the function call
     * @param argCount The actual number of arguments provided.
     */
    var validateArgCount = function (fnName, minCount, maxCount, argCount) {
        var argError;
        if (argCount < minCount) {
            argError = 'at least ' + minCount;
        }
        else if (argCount > maxCount) {
            argError = maxCount === 0 ? 'none' : 'no more than ' + maxCount;
        }
        if (argError) {
            var error = fnName +
                ' failed: Was called with ' +
                argCount +
                (argCount === 1 ? ' argument.' : ' arguments.') +
                ' Expects ' +
                argError +
                '.';
            throw new Error(error);
        }
    };
    /**
     * Generates a string to prefix an error message about failed argument validation
     *
     * @param fnName The function name
     * @param argumentNumber The index of the argument
     * @param optional Whether or not the argument is optional
     * @return The prefix to add to the error thrown for validation.
     */
    function errorPrefix(fnName, argumentNumber, optional) {
        var argName = '';
        switch (argumentNumber) {
            case 1:
                argName = optional ? 'first' : 'First';
                break;
            case 2:
                argName = optional ? 'second' : 'Second';
                break;
            case 3:
                argName = optional ? 'third' : 'Third';
                break;
            case 4:
                argName = optional ? 'fourth' : 'Fourth';
                break;
            default:
                throw new Error('errorPrefix called with argumentNumber > 4.  Need to update it?');
        }
        var error = fnName + ' failed: ';
        error += argName + ' argument ';
        return error;
    }
    /**
     * @param fnName
     * @param argumentNumber
     * @param namespace
     * @param optional
     */
    function validateNamespace(fnName, argumentNumber, namespace, optional) {
        if (optional && !namespace) {
            return;
        }
        if (typeof namespace !== 'string') {
            //TODO: I should do more validation here. We only allow certain chars in namespaces.
            throw new Error(errorPrefix(fnName, argumentNumber, optional) +
                'must be a valid firebase namespace.');
        }
    }
    function validateCallback(fnName, argumentNumber, 
    // eslint-disable-next-line @typescript-eslint/ban-types
    callback, optional) {
        if (optional && !callback) {
            return;
        }
        if (typeof callback !== 'function') {
            throw new Error(errorPrefix(fnName, argumentNumber, optional) +
                'must be a valid function.');
        }
    }
    function validateContextObject(fnName, argumentNumber, context, optional) {
        if (optional && !context) {
            return;
        }
        if (typeof context !== 'object' || context === null) {
            throw new Error(errorPrefix(fnName, argumentNumber, optional) +
                'must be a valid context object.');
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // Code originally came from goog.crypt.stringToUtf8ByteArray, but for some reason they
    // automatically replaced '\r\n' with '\n', and they didn't handle surrogate pairs,
    // so it's been modified.
    // Note that not all Unicode characters appear as single characters in JavaScript strings.
    // fromCharCode returns the UTF-16 encoding of a character - so some Unicode characters
    // use 2 characters in Javascript.  All 4-byte UTF-8 characters begin with a first
    // character in the range 0xD800 - 0xDBFF (the first character of a so-called surrogate
    // pair).
    // See http://www.ecma-international.org/ecma-262/5.1/#sec-15.1.3
    /**
     * @param {string} str
     * @return {Array}
     */
    var stringToByteArray$1 = function (str) {
        var out = [];
        var p = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            // Is this the lead surrogate in a surrogate pair?
            if (c >= 0xd800 && c <= 0xdbff) {
                var high = c - 0xd800; // the high 10 bits.
                i++;
                assert(i < str.length, 'Surrogate pair missing trail surrogate.');
                var low = str.charCodeAt(i) - 0xdc00; // the low 10 bits.
                c = 0x10000 + (high << 10) + low;
            }
            if (c < 128) {
                out[p++] = c;
            }
            else if (c < 2048) {
                out[p++] = (c >> 6) | 192;
                out[p++] = (c & 63) | 128;
            }
            else if (c < 65536) {
                out[p++] = (c >> 12) | 224;
                out[p++] = ((c >> 6) & 63) | 128;
                out[p++] = (c & 63) | 128;
            }
            else {
                out[p++] = (c >> 18) | 240;
                out[p++] = ((c >> 12) & 63) | 128;
                out[p++] = ((c >> 6) & 63) | 128;
                out[p++] = (c & 63) | 128;
            }
        }
        return out;
    };
    /**
     * Calculate length without actually converting; useful for doing cheaper validation.
     * @param {string} str
     * @return {number}
     */
    var stringLength = function (str) {
        var p = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 128) {
                p++;
            }
            else if (c < 2048) {
                p += 2;
            }
            else if (c >= 0xd800 && c <= 0xdbff) {
                // Lead surrogate of a surrogate pair.  The pair together will take 4 bytes to represent.
                p += 4;
                i++; // skip trail surrogate.
            }
            else {
                p += 3;
            }
        }
        return p;
    };

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * The amount of milliseconds to exponentially increase.
     */
    var DEFAULT_INTERVAL_MILLIS = 1000;
    /**
     * The factor to backoff by.
     * Should be a number greater than 1.
     */
    var DEFAULT_BACKOFF_FACTOR = 2;
    /**
     * The maximum milliseconds to increase to.
     *
     * <p>Visible for testing
     */
    var MAX_VALUE_MILLIS = 4 * 60 * 60 * 1000; // Four hours, like iOS and Android.
    /**
     * The percentage of backoff time to randomize by.
     * See
     * http://go/safe-client-behavior#step-1-determine-the-appropriate-retry-interval-to-handle-spike-traffic
     * for context.
     *
     * <p>Visible for testing
     */
    var RANDOM_FACTOR = 0.5;
    /**
     * Based on the backoff method from
     * https://github.com/google/closure-library/blob/master/closure/goog/math/exponentialbackoff.js.
     * Extracted here so we don't need to pass metadata and a stateful ExponentialBackoff object around.
     */
    function calculateBackoffMillis(backoffCount, intervalMillis, backoffFactor) {
        if (intervalMillis === void 0) { intervalMillis = DEFAULT_INTERVAL_MILLIS; }
        if (backoffFactor === void 0) { backoffFactor = DEFAULT_BACKOFF_FACTOR; }
        // Calculates an exponentially increasing value.
        // Deviation: calculates value from count and a constant interval, so we only need to save value
        // and count to restore state.
        var currBaseValue = intervalMillis * Math.pow(backoffFactor, backoffCount);
        // A random "fuzz" to avoid waves of retries.
        // Deviation: randomFactor is required.
        var randomWait = Math.round(
        // A fraction of the backoff value to add/subtract.
        // Deviation: changes multiplication order to improve readability.
        RANDOM_FACTOR *
            currBaseValue *
            // A random float (rounded to int by Math.round above) in the range [-1, 1]. Determines
            // if we add or subtract.
            (Math.random() - 0.5) *
            2);
        // Limits backoff to max to avoid effectively permanent backoff.
        return Math.min(MAX_VALUE_MILLIS, currBaseValue + randomWait);
    }

    exports.CONSTANTS = CONSTANTS;
    exports.Deferred = Deferred;
    exports.ErrorFactory = ErrorFactory;
    exports.FirebaseError = FirebaseError;
    exports.MAX_VALUE_MILLIS = MAX_VALUE_MILLIS;
    exports.RANDOM_FACTOR = RANDOM_FACTOR;
    exports.Sha1 = Sha1;
    exports.areCookiesEnabled = areCookiesEnabled;
    exports.assert = assert;
    exports.assertionError = assertionError;
    exports.async = async;
    exports.base64 = base64;
    exports.base64Decode = base64Decode;
    exports.base64Encode = base64Encode;
    exports.calculateBackoffMillis = calculateBackoffMillis;
    exports.contains = contains;
    exports.createSubscribe = createSubscribe;
    exports.decode = decode;
    exports.deepCopy = deepCopy;
    exports.deepExtend = deepExtend;
    exports.errorPrefix = errorPrefix;
    exports.getUA = getUA;
    exports.isAdmin = isAdmin;
    exports.isBrowser = isBrowser;
    exports.isBrowserExtension = isBrowserExtension;
    exports.isElectron = isElectron;
    exports.isEmpty = isEmpty;
    exports.isIE = isIE;
    exports.isIndexedDBAvailable = isIndexedDBAvailable;
    exports.isMobileCordova = isMobileCordova;
    exports.isNode = isNode;
    exports.isNodeSdk = isNodeSdk;
    exports.isReactNative = isReactNative;
    exports.isSafari = isSafari;
    exports.isUWP = isUWP;
    exports.isValidFormat = isValidFormat;
    exports.isValidTimestamp = isValidTimestamp;
    exports.issuedAtTime = issuedAtTime;
    exports.jsonEval = jsonEval;
    exports.map = map;
    exports.querystring = querystring;
    exports.querystringDecode = querystringDecode;
    exports.safeGet = safeGet;
    exports.stringLength = stringLength;
    exports.stringToByteArray = stringToByteArray$1;
    exports.stringify = stringify;
    exports.validateArgCount = validateArgCount;
    exports.validateCallback = validateCallback;
    exports.validateContextObject = validateContextObject;
    exports.validateIndexedDBOpenable = validateIndexedDBOpenable;
    exports.validateNamespace = validateNamespace;

    });

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics$2 = function(d, b) {
        extendStatics$2 = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics$2(d, b);
    };

    function __extends$2(d, b) {
        extendStatics$2(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign$2 = function() {
        __assign$2 = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign$2.apply(this, arguments);
    };

    function __rest$2(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }

    function __decorate$2(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __param$2(paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    }

    function __metadata$2(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    }

    function __awaiter$2(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator$2(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __createBinding$2(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }

    function __exportStar$2(m, exports) {
        for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
    }

    function __values$2(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    function __read$2(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread$2() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read$2(arguments[i]));
        return ar;
    }

    function __spreadArrays$2() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }
    function __await$2(v) {
        return this instanceof __await$2 ? (this.v = v, this) : new __await$2(v);
    }

    function __asyncGenerator$2(thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
        function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await$2 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    }

    function __asyncDelegator$2(o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$2(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
    }

    function __asyncValues$2(o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values$2 === "function" ? __values$2(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    }

    function __makeTemplateObject$2(cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    }
    function __importStar$2(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result.default = mod;
        return result;
    }

    function __importDefault$2(mod) {
        return (mod && mod.__esModule) ? mod : { default: mod };
    }

    function __classPrivateFieldGet$2(receiver, privateMap) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to get private field on non-instance");
        }
        return privateMap.get(receiver);
    }

    function __classPrivateFieldSet$2(receiver, privateMap, value) {
        if (!privateMap.has(receiver)) {
            throw new TypeError("attempted to set private field on non-instance");
        }
        privateMap.set(receiver, value);
        return value;
    }

    var tslib_es6$2 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        __extends: __extends$2,
        get __assign () { return __assign$2; },
        __rest: __rest$2,
        __decorate: __decorate$2,
        __param: __param$2,
        __metadata: __metadata$2,
        __awaiter: __awaiter$2,
        __generator: __generator$2,
        __createBinding: __createBinding$2,
        __exportStar: __exportStar$2,
        __values: __values$2,
        __read: __read$2,
        __spread: __spread$2,
        __spreadArrays: __spreadArrays$2,
        __await: __await$2,
        __asyncGenerator: __asyncGenerator$2,
        __asyncDelegator: __asyncDelegator$2,
        __asyncValues: __asyncValues$2,
        __makeTemplateObject: __makeTemplateObject$2,
        __importStar: __importStar$2,
        __importDefault: __importDefault$2,
        __classPrivateFieldGet: __classPrivateFieldGet$2,
        __classPrivateFieldSet: __classPrivateFieldSet$2
    });

    var index_cjs$1 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', { value: true });




    /**
     * Component for service name T, e.g. `auth`, `auth-internal`
     */
    var Component = /** @class */ (function () {
        /**
         *
         * @param name The public service name, e.g. app, auth, firestore, database
         * @param instanceFactory Service factory responsible for creating the public interface
         * @param type whether the service provided by the component is public or private
         */
        function Component(name, instanceFactory, type) {
            this.name = name;
            this.instanceFactory = instanceFactory;
            this.type = type;
            this.multipleInstances = false;
            /**
             * Properties to be added to the service namespace
             */
            this.serviceProps = {};
            this.instantiationMode = "LAZY" /* LAZY */;
        }
        Component.prototype.setInstantiationMode = function (mode) {
            this.instantiationMode = mode;
            return this;
        };
        Component.prototype.setMultipleInstances = function (multipleInstances) {
            this.multipleInstances = multipleInstances;
            return this;
        };
        Component.prototype.setServiceProps = function (props) {
            this.serviceProps = props;
            return this;
        };
        return Component;
    }());

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var DEFAULT_ENTRY_NAME = '[DEFAULT]';

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Provider for instance for service name T, e.g. 'auth', 'auth-internal'
     * NameServiceMapping[T] is an alias for the type of the instance
     */
    var Provider = /** @class */ (function () {
        function Provider(name, container) {
            this.name = name;
            this.container = container;
            this.component = null;
            this.instances = new Map();
            this.instancesDeferred = new Map();
        }
        /**
         * @param identifier A provider can provide mulitple instances of a service
         * if this.component.multipleInstances is true.
         */
        Provider.prototype.get = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            // if multipleInstances is not supported, use the default name
            var normalizedIdentifier = this.normalizeInstanceIdentifier(identifier);
            if (!this.instancesDeferred.has(normalizedIdentifier)) {
                var deferred = new index_cjs.Deferred();
                this.instancesDeferred.set(normalizedIdentifier, deferred);
                // If the service instance is available, resolve the promise with it immediately
                try {
                    var instance = this.getOrInitializeService(normalizedIdentifier);
                    if (instance) {
                        deferred.resolve(instance);
                    }
                }
                catch (e) {
                    // when the instance factory throws an exception during get(), it should not cause
                    // a fatal error. We just return the unresolved promise in this case.
                }
            }
            return this.instancesDeferred.get(normalizedIdentifier).promise;
        };
        Provider.prototype.getImmediate = function (options) {
            var _a = tslib_es6$2.__assign({ identifier: DEFAULT_ENTRY_NAME, optional: false }, options), identifier = _a.identifier, optional = _a.optional;
            // if multipleInstances is not supported, use the default name
            var normalizedIdentifier = this.normalizeInstanceIdentifier(identifier);
            try {
                var instance = this.getOrInitializeService(normalizedIdentifier);
                if (!instance) {
                    if (optional) {
                        return null;
                    }
                    throw Error("Service " + this.name + " is not available");
                }
                return instance;
            }
            catch (e) {
                if (optional) {
                    return null;
                }
                else {
                    throw e;
                }
            }
        };
        Provider.prototype.getComponent = function () {
            return this.component;
        };
        Provider.prototype.setComponent = function (component) {
            var e_1, _a;
            if (component.name !== this.name) {
                throw Error("Mismatching Component " + component.name + " for Provider " + this.name + ".");
            }
            if (this.component) {
                throw Error("Component for " + this.name + " has already been provided");
            }
            this.component = component;
            // if the service is eager, initialize the default instance
            if (isComponentEager(component)) {
                try {
                    this.getOrInitializeService(DEFAULT_ENTRY_NAME);
                }
                catch (e) {
                    // when the instance factory for an eager Component throws an exception during the eager
                    // initialization, it should not cause a fatal error.
                    // TODO: Investigate if we need to make it configurable, because some component may want to cause
                    // a fatal error in this case?
                }
            }
            try {
                // Create service instances for the pending promises and resolve them
                // NOTE: if this.multipleInstances is false, only the default instance will be created
                // and all promises with resolve with it regardless of the identifier.
                for (var _b = tslib_es6$2.__values(this.instancesDeferred.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = tslib_es6$2.__read(_c.value, 2), instanceIdentifier = _d[0], instanceDeferred = _d[1];
                    var normalizedIdentifier = this.normalizeInstanceIdentifier(instanceIdentifier);
                    try {
                        // `getOrInitializeService()` should always return a valid instance since a component is guaranteed. use ! to make typescript happy.
                        var instance = this.getOrInitializeService(normalizedIdentifier);
                        instanceDeferred.resolve(instance);
                    }
                    catch (e) {
                        // when the instance factory throws an exception, it should not cause
                        // a fatal error. We just leave the promise unresolved.
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        Provider.prototype.clearInstance = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            this.instancesDeferred.delete(identifier);
            this.instances.delete(identifier);
        };
        // app.delete() will call this method on every provider to delete the services
        // TODO: should we mark the provider as deleted?
        Provider.prototype.delete = function () {
            return tslib_es6$2.__awaiter(this, void 0, void 0, function () {
                var services;
                return tslib_es6$2.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            services = Array.from(this.instances.values());
                            return [4 /*yield*/, Promise.all(tslib_es6$2.__spread(services
                                    .filter(function (service) { return 'INTERNAL' in service; }) // legacy services
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    .map(function (service) { return service.INTERNAL.delete(); }), services
                                    .filter(function (service) { return '_delete' in service; }) // modularized services
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    .map(function (service) { return service._delete(); })))];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        Provider.prototype.isComponentSet = function () {
            return this.component != null;
        };
        Provider.prototype.getOrInitializeService = function (identifier) {
            var instance = this.instances.get(identifier);
            if (!instance && this.component) {
                instance = this.component.instanceFactory(this.container, normalizeIdentifierForFactory(identifier));
                this.instances.set(identifier, instance);
            }
            return instance || null;
        };
        Provider.prototype.normalizeInstanceIdentifier = function (identifier) {
            if (this.component) {
                return this.component.multipleInstances ? identifier : DEFAULT_ENTRY_NAME;
            }
            else {
                return identifier; // assume multiple instances are supported before the component is provided.
            }
        };
        return Provider;
    }());
    // undefined should be passed to the service factory for the default instance
    function normalizeIdentifierForFactory(identifier) {
        return identifier === DEFAULT_ENTRY_NAME ? undefined : identifier;
    }
    function isComponentEager(component) {
        return component.instantiationMode === "EAGER" /* EAGER */;
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * ComponentContainer that provides Providers for service name T, e.g. `auth`, `auth-internal`
     */
    var ComponentContainer = /** @class */ (function () {
        function ComponentContainer(name) {
            this.name = name;
            this.providers = new Map();
        }
        /**
         *
         * @param component Component being added
         * @param overwrite When a component with the same name has already been registered,
         * if overwrite is true: overwrite the existing component with the new component and create a new
         * provider with the new component. It can be useful in tests where you want to use different mocks
         * for different tests.
         * if overwrite is false: throw an exception
         */
        ComponentContainer.prototype.addComponent = function (component) {
            var provider = this.getProvider(component.name);
            if (provider.isComponentSet()) {
                throw new Error("Component " + component.name + " has already been registered with " + this.name);
            }
            provider.setComponent(component);
        };
        ComponentContainer.prototype.addOrOverwriteComponent = function (component) {
            var provider = this.getProvider(component.name);
            if (provider.isComponentSet()) {
                // delete the existing provider from the container, so we can register the new component
                this.providers.delete(component.name);
            }
            this.addComponent(component);
        };
        /**
         * getProvider provides a type safe interface where it can only be called with a field name
         * present in NameServiceMapping interface.
         *
         * Firebase SDKs providing services should extend NameServiceMapping interface to register
         * themselves.
         */
        ComponentContainer.prototype.getProvider = function (name) {
            if (this.providers.has(name)) {
                return this.providers.get(name);
            }
            // create a Provider for a service that hasn't registered with Firebase
            var provider = new Provider(name, this);
            this.providers.set(name, provider);
            return provider;
        };
        ComponentContainer.prototype.getProviders = function () {
            return Array.from(this.providers.values());
        };
        return ComponentContainer;
    }());

    exports.Component = Component;
    exports.ComponentContainer = ComponentContainer;
    exports.Provider = Provider;

    });

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __spreadArrays$3() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var _a;
    /**
     * A container for all of the Logger instances
     */
    var instances = [];
    /**
     * The JS SDK supports 5 log levels and also allows a user the ability to
     * silence the logs altogether.
     *
     * The order is a follows:
     * DEBUG < VERBOSE < INFO < WARN < ERROR
     *
     * All of the log types above the current log level will be captured (i.e. if
     * you set the log level to `INFO`, errors will still be logged, but `DEBUG` and
     * `VERBOSE` logs will not)
     */
    var LogLevel;
    (function (LogLevel) {
        LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
        LogLevel[LogLevel["VERBOSE"] = 1] = "VERBOSE";
        LogLevel[LogLevel["INFO"] = 2] = "INFO";
        LogLevel[LogLevel["WARN"] = 3] = "WARN";
        LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
        LogLevel[LogLevel["SILENT"] = 5] = "SILENT";
    })(LogLevel || (LogLevel = {}));
    var levelStringToEnum = {
        'debug': LogLevel.DEBUG,
        'verbose': LogLevel.VERBOSE,
        'info': LogLevel.INFO,
        'warn': LogLevel.WARN,
        'error': LogLevel.ERROR,
        'silent': LogLevel.SILENT
    };
    /**
     * The default log level
     */
    var defaultLogLevel = LogLevel.INFO;
    /**
     * By default, `console.debug` is not displayed in the developer console (in
     * chrome). To avoid forcing users to have to opt-in to these logs twice
     * (i.e. once for firebase, and once in the console), we are sending `DEBUG`
     * logs to the `console.log` function.
     */
    var ConsoleMethod = (_a = {},
        _a[LogLevel.DEBUG] = 'log',
        _a[LogLevel.VERBOSE] = 'log',
        _a[LogLevel.INFO] = 'info',
        _a[LogLevel.WARN] = 'warn',
        _a[LogLevel.ERROR] = 'error',
        _a);
    /**
     * The default log handler will forward DEBUG, VERBOSE, INFO, WARN, and ERROR
     * messages on to their corresponding console counterparts (if the log method
     * is supported by the current log level)
     */
    var defaultLogHandler = function (instance, logType) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        if (logType < instance.logLevel) {
            return;
        }
        var now = new Date().toISOString();
        var method = ConsoleMethod[logType];
        if (method) {
            console[method].apply(console, __spreadArrays$3(["[" + now + "]  " + instance.name + ":"], args));
        }
        else {
            throw new Error("Attempted to log a message with an invalid logType (value: " + logType + ")");
        }
    };
    var Logger = /** @class */ (function () {
        /**
         * Gives you an instance of a Logger to capture messages according to
         * Firebase's logging scheme.
         *
         * @param name The name that the logs will be associated with
         */
        function Logger(name) {
            this.name = name;
            /**
             * The log level of the given Logger instance.
             */
            this._logLevel = defaultLogLevel;
            /**
             * The main (internal) log handler for the Logger instance.
             * Can be set to a new function in internal package code but not by user.
             */
            this._logHandler = defaultLogHandler;
            /**
             * The optional, additional, user-defined log handler for the Logger instance.
             */
            this._userLogHandler = null;
            /**
             * Capture the current instance for later use
             */
            instances.push(this);
        }
        Object.defineProperty(Logger.prototype, "logLevel", {
            get: function () {
                return this._logLevel;
            },
            set: function (val) {
                if (!(val in LogLevel)) {
                    throw new TypeError("Invalid value \"" + val + "\" assigned to `logLevel`");
                }
                this._logLevel = val;
            },
            enumerable: false,
            configurable: true
        });
        // Workaround for setter/getter having to be the same type.
        Logger.prototype.setLogLevel = function (val) {
            this._logLevel = typeof val === 'string' ? levelStringToEnum[val] : val;
        };
        Object.defineProperty(Logger.prototype, "logHandler", {
            get: function () {
                return this._logHandler;
            },
            set: function (val) {
                if (typeof val !== 'function') {
                    throw new TypeError('Value assigned to `logHandler` must be a function');
                }
                this._logHandler = val;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Logger.prototype, "userLogHandler", {
            get: function () {
                return this._userLogHandler;
            },
            set: function (val) {
                this._userLogHandler = val;
            },
            enumerable: false,
            configurable: true
        });
        /**
         * The functions below are all based on the `console` interface
         */
        Logger.prototype.debug = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays$3([this, LogLevel.DEBUG], args));
            this._logHandler.apply(this, __spreadArrays$3([this, LogLevel.DEBUG], args));
        };
        Logger.prototype.log = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays$3([this, LogLevel.VERBOSE], args));
            this._logHandler.apply(this, __spreadArrays$3([this, LogLevel.VERBOSE], args));
        };
        Logger.prototype.info = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays$3([this, LogLevel.INFO], args));
            this._logHandler.apply(this, __spreadArrays$3([this, LogLevel.INFO], args));
        };
        Logger.prototype.warn = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays$3([this, LogLevel.WARN], args));
            this._logHandler.apply(this, __spreadArrays$3([this, LogLevel.WARN], args));
        };
        Logger.prototype.error = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays$3([this, LogLevel.ERROR], args));
            this._logHandler.apply(this, __spreadArrays$3([this, LogLevel.ERROR], args));
        };
        return Logger;
    }());
    function setLogLevel(level) {
        instances.forEach(function (inst) {
            inst.setLogLevel(level);
        });
    }
    function setUserLogHandler(logCallback, options) {
        var _loop_1 = function (instance) {
            var customLogLevel = null;
            if (options && options.level) {
                customLogLevel = levelStringToEnum[options.level];
            }
            if (logCallback === null) {
                instance.userLogHandler = null;
            }
            else {
                instance.userLogHandler = function (instance, level) {
                    var args = [];
                    for (var _i = 2; _i < arguments.length; _i++) {
                        args[_i - 2] = arguments[_i];
                    }
                    var message = args
                        .map(function (arg) {
                        if (arg == null) {
                            return null;
                        }
                        else if (typeof arg === 'string') {
                            return arg;
                        }
                        else if (typeof arg === 'number' || typeof arg === 'boolean') {
                            return arg.toString();
                        }
                        else if (arg instanceof Error) {
                            return arg.message;
                        }
                        else {
                            try {
                                return JSON.stringify(arg);
                            }
                            catch (ignored) {
                                return null;
                            }
                        }
                    })
                        .filter(function (arg) { return arg; })
                        .join(' ');
                    if (level >= (customLogLevel !== null && customLogLevel !== void 0 ? customLogLevel : instance.logLevel)) {
                        logCallback({
                            level: LogLevel[level].toLowerCase(),
                            message: message,
                            args: args,
                            type: instance.name
                        });
                    }
                };
            }
        };
        for (var _i = 0, instances_1 = instances; _i < instances_1.length; _i++) {
            var instance = instances_1[_i];
            _loop_1(instance);
        }
    }

    var index_esm = /*#__PURE__*/Object.freeze({
        __proto__: null,
        get LogLevel () { return LogLevel; },
        Logger: Logger,
        setLogLevel: setLogLevel,
        setUserLogHandler: setUserLogHandler
    });

    var index_cjs$2 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', { value: true });






    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var _a;
    var ERRORS = (_a = {},
        _a["no-app" /* NO_APP */] = "No Firebase App '{$appName}' has been created - " +
            'call Firebase App.initializeApp()',
        _a["bad-app-name" /* BAD_APP_NAME */] = "Illegal App name: '{$appName}",
        _a["duplicate-app" /* DUPLICATE_APP */] = "Firebase App named '{$appName}' already exists",
        _a["app-deleted" /* APP_DELETED */] = "Firebase App named '{$appName}' already deleted",
        _a["invalid-app-argument" /* INVALID_APP_ARGUMENT */] = 'firebase.{$appName}() takes either no argument or a ' +
            'Firebase App instance.',
        _a["invalid-log-argument" /* INVALID_LOG_ARGUMENT */] = 'First argument to `onLog` must be null or a function.',
        _a);
    var ERROR_FACTORY = new index_cjs.ErrorFactory('app', 'Firebase', ERRORS);

    var name$1 = "@firebase/app";
    var version = "0.6.11";

    var name$2 = "@firebase/analytics";

    var name$3 = "@firebase/auth";

    var name$4 = "@firebase/database";

    var name$5 = "@firebase/functions";

    var name$6 = "@firebase/installations";

    var name$7 = "@firebase/messaging";

    var name$8 = "@firebase/performance";

    var name$9 = "@firebase/remote-config";

    var name$a = "@firebase/storage";

    var name$b = "@firebase/firestore";

    var name$c = "firebase-wrapper";

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var _a$1;
    var DEFAULT_ENTRY_NAME = '[DEFAULT]';
    var PLATFORM_LOG_STRING = (_a$1 = {},
        _a$1[name$1] = 'fire-core',
        _a$1[name$2] = 'fire-analytics',
        _a$1[name$3] = 'fire-auth',
        _a$1[name$4] = 'fire-rtdb',
        _a$1[name$5] = 'fire-fn',
        _a$1[name$6] = 'fire-iid',
        _a$1[name$7] = 'fire-fcm',
        _a$1[name$8] = 'fire-perf',
        _a$1[name$9] = 'fire-rc',
        _a$1[name$a] = 'fire-gcs',
        _a$1[name$b] = 'fire-fst',
        _a$1['fire-js'] = 'fire-js',
        _a$1[name$c] = 'fire-js-all',
        _a$1);

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var logger = new index_esm.Logger('@firebase/app');

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Global context object for a collection of services using
     * a shared authentication state.
     */
    var FirebaseAppImpl = /** @class */ (function () {
        function FirebaseAppImpl(options, config, firebase_) {
            var e_1, _a;
            var _this = this;
            this.firebase_ = firebase_;
            this.isDeleted_ = false;
            this.name_ = config.name;
            this.automaticDataCollectionEnabled_ =
                config.automaticDataCollectionEnabled || false;
            this.options_ = index_cjs.deepCopy(options);
            this.container = new index_cjs$1.ComponentContainer(config.name);
            // add itself to container
            this._addComponent(new index_cjs$1.Component('app', function () { return _this; }, "PUBLIC" /* PUBLIC */));
            try {
                // populate ComponentContainer with existing components
                for (var _b = tslib_es6.__values(this.firebase_.INTERNAL.components.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var component$1 = _c.value;
                    this._addComponent(component$1);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        Object.defineProperty(FirebaseAppImpl.prototype, "automaticDataCollectionEnabled", {
            get: function () {
                this.checkDestroyed_();
                return this.automaticDataCollectionEnabled_;
            },
            set: function (val) {
                this.checkDestroyed_();
                this.automaticDataCollectionEnabled_ = val;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(FirebaseAppImpl.prototype, "name", {
            get: function () {
                this.checkDestroyed_();
                return this.name_;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(FirebaseAppImpl.prototype, "options", {
            get: function () {
                this.checkDestroyed_();
                return this.options_;
            },
            enumerable: false,
            configurable: true
        });
        FirebaseAppImpl.prototype.delete = function () {
            var _this = this;
            return new Promise(function (resolve) {
                _this.checkDestroyed_();
                resolve();
            })
                .then(function () {
                _this.firebase_.INTERNAL.removeApp(_this.name_);
                return Promise.all(_this.container.getProviders().map(function (provider) { return provider.delete(); }));
            })
                .then(function () {
                _this.isDeleted_ = true;
            });
        };
        /**
         * Return a service instance associated with this app (creating it
         * on demand), identified by the passed instanceIdentifier.
         *
         * NOTE: Currently storage and functions are the only ones that are leveraging this
         * functionality. They invoke it by calling:
         *
         * ```javascript
         * firebase.app().storage('STORAGE BUCKET ID')
         * ```
         *
         * The service name is passed to this already
         * @internal
         */
        FirebaseAppImpl.prototype._getService = function (name, instanceIdentifier) {
            if (instanceIdentifier === void 0) { instanceIdentifier = DEFAULT_ENTRY_NAME; }
            this.checkDestroyed_();
            // getImmediate will always succeed because _getService is only called for registered components.
            return this.container.getProvider(name).getImmediate({
                identifier: instanceIdentifier
            });
        };
        /**
         * Remove a service instance from the cache, so we will create a new instance for this service
         * when people try to get this service again.
         *
         * NOTE: currently only firestore is using this functionality to support firestore shutdown.
         *
         * @param name The service name
         * @param instanceIdentifier instance identifier in case multiple instances are allowed
         * @internal
         */
        FirebaseAppImpl.prototype._removeServiceInstance = function (name, instanceIdentifier) {
            if (instanceIdentifier === void 0) { instanceIdentifier = DEFAULT_ENTRY_NAME; }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.container.getProvider(name).clearInstance(instanceIdentifier);
        };
        /**
         * @param component the component being added to this app's container
         */
        FirebaseAppImpl.prototype._addComponent = function (component) {
            try {
                this.container.addComponent(component);
            }
            catch (e) {
                logger.debug("Component " + component.name + " failed to register with FirebaseApp " + this.name, e);
            }
        };
        FirebaseAppImpl.prototype._addOrOverwriteComponent = function (component) {
            this.container.addOrOverwriteComponent(component);
        };
        /**
         * This function will throw an Error if the App has already been deleted -
         * use before performing API actions on the App.
         */
        FirebaseAppImpl.prototype.checkDestroyed_ = function () {
            if (this.isDeleted_) {
                throw ERROR_FACTORY.create("app-deleted" /* APP_DELETED */, { appName: this.name_ });
            }
        };
        return FirebaseAppImpl;
    }());
    // Prevent dead-code elimination of these methods w/o invalid property
    // copying.
    (FirebaseAppImpl.prototype.name && FirebaseAppImpl.prototype.options) ||
        FirebaseAppImpl.prototype.delete ||
        console.log('dc');

    var version$1 = "7.20.0";

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Because auth can't share code with other components, we attach the utility functions
     * in an internal namespace to share code.
     * This function return a firebase namespace object without
     * any utility functions, so it can be shared between the regular firebaseNamespace and
     * the lite version.
     */
    function createFirebaseNamespaceCore(firebaseAppImpl) {
        var apps = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        var components = new Map();
        // A namespace is a plain JavaScript Object.
        var namespace = {
            // Hack to prevent Babel from modifying the object returned
            // as the firebase namespace.
            // @ts-ignore
            __esModule: true,
            initializeApp: initializeApp,
            // @ts-ignore
            app: app,
            registerVersion: registerVersion,
            setLogLevel: index_esm.setLogLevel,
            onLog: onLog,
            // @ts-ignore
            apps: null,
            SDK_VERSION: version$1,
            INTERNAL: {
                registerComponent: registerComponent,
                removeApp: removeApp,
                components: components,
                useAsService: useAsService
            }
        };
        // Inject a circular default export to allow Babel users who were previously
        // using:
        //
        //   import firebase from 'firebase';
        //   which becomes: var firebase = require('firebase').default;
        //
        // instead of
        //
        //   import * as firebase from 'firebase';
        //   which becomes: var firebase = require('firebase');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        namespace['default'] = namespace;
        // firebase.apps is a read-only getter.
        Object.defineProperty(namespace, 'apps', {
            get: getApps
        });
        /**
         * Called by App.delete() - but before any services associated with the App
         * are deleted.
         */
        function removeApp(name) {
            delete apps[name];
        }
        /**
         * Get the App object for a given name (or DEFAULT).
         */
        function app(name) {
            name = name || DEFAULT_ENTRY_NAME;
            if (!index_cjs.contains(apps, name)) {
                throw ERROR_FACTORY.create("no-app" /* NO_APP */, { appName: name });
            }
            return apps[name];
        }
        // @ts-ignore
        app['App'] = firebaseAppImpl;
        function initializeApp(options, rawConfig) {
            if (rawConfig === void 0) { rawConfig = {}; }
            if (typeof rawConfig !== 'object' || rawConfig === null) {
                var name_1 = rawConfig;
                rawConfig = { name: name_1 };
            }
            var config = rawConfig;
            if (config.name === undefined) {
                config.name = DEFAULT_ENTRY_NAME;
            }
            var name = config.name;
            if (typeof name !== 'string' || !name) {
                throw ERROR_FACTORY.create("bad-app-name" /* BAD_APP_NAME */, {
                    appName: String(name)
                });
            }
            if (index_cjs.contains(apps, name)) {
                throw ERROR_FACTORY.create("duplicate-app" /* DUPLICATE_APP */, { appName: name });
            }
            var app = new firebaseAppImpl(options, config, namespace);
            apps[name] = app;
            return app;
        }
        /*
         * Return an array of all the non-deleted FirebaseApps.
         */
        function getApps() {
            // Make a copy so caller cannot mutate the apps list.
            return Object.keys(apps).map(function (name) { return apps[name]; });
        }
        function registerComponent(component) {
            var e_1, _a;
            var componentName = component.name;
            if (components.has(componentName)) {
                logger.debug("There were multiple attempts to register component " + componentName + ".");
                return component.type === "PUBLIC" /* PUBLIC */
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        namespace[componentName]
                    : null;
            }
            components.set(componentName, component);
            // create service namespace for public components
            if (component.type === "PUBLIC" /* PUBLIC */) {
                // The Service namespace is an accessor function ...
                var serviceNamespace = function (appArg) {
                    if (appArg === void 0) { appArg = app(); }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (typeof appArg[componentName] !== 'function') {
                        // Invalid argument.
                        // This happens in the following case: firebase.storage('gs:/')
                        throw ERROR_FACTORY.create("invalid-app-argument" /* INVALID_APP_ARGUMENT */, {
                            appName: componentName
                        });
                    }
                    // Forward service instance lookup to the FirebaseApp.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return appArg[componentName]();
                };
                // ... and a container for service-level properties.
                if (component.serviceProps !== undefined) {
                    index_cjs.deepExtend(serviceNamespace, component.serviceProps);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                namespace[componentName] = serviceNamespace;
                // Patch the FirebaseAppImpl prototype
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                firebaseAppImpl.prototype[componentName] =
                    // TODO: The eslint disable can be removed and the 'ignoreRestArgs'
                    // option added to the no-explicit-any rule when ESlint releases it.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    function () {
                        var args = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            args[_i] = arguments[_i];
                        }
                        var serviceFxn = this._getService.bind(this, componentName);
                        return serviceFxn.apply(this, component.multipleInstances ? args : []);
                    };
            }
            try {
                // add the component to existing app instances
                for (var _b = tslib_es6.__values(Object.keys(apps)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var appName = _c.value;
                    apps[appName]._addComponent(component);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return component.type === "PUBLIC" /* PUBLIC */
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    namespace[componentName]
                : null;
        }
        function registerVersion(libraryKeyOrName, version, variant) {
            var _a;
            // TODO: We can use this check to whitelist strings when/if we set up
            // a good whitelist system.
            var library = (_a = PLATFORM_LOG_STRING[libraryKeyOrName]) !== null && _a !== void 0 ? _a : libraryKeyOrName;
            if (variant) {
                library += "-" + variant;
            }
            var libraryMismatch = library.match(/\s|\//);
            var versionMismatch = version.match(/\s|\//);
            if (libraryMismatch || versionMismatch) {
                var warning = [
                    "Unable to register library \"" + library + "\" with version \"" + version + "\":"
                ];
                if (libraryMismatch) {
                    warning.push("library name \"" + library + "\" contains illegal characters (whitespace or \"/\")");
                }
                if (libraryMismatch && versionMismatch) {
                    warning.push('and');
                }
                if (versionMismatch) {
                    warning.push("version name \"" + version + "\" contains illegal characters (whitespace or \"/\")");
                }
                logger.warn(warning.join(' '));
                return;
            }
            registerComponent(new index_cjs$1.Component(library + "-version", function () { return ({ library: library, version: version }); }, "VERSION" /* VERSION */));
        }
        function onLog(logCallback, options) {
            if (logCallback !== null && typeof logCallback !== 'function') {
                throw ERROR_FACTORY.create("invalid-log-argument" /* INVALID_LOG_ARGUMENT */, {
                    appName: name
                });
            }
            index_esm.setUserLogHandler(logCallback, options);
        }
        // Map the requested service to a registered service name
        // (used to map auth to serverAuth service when needed).
        function useAsService(app, name) {
            if (name === 'serverAuth') {
                return null;
            }
            var useService = name;
            return useService;
        }
        return namespace;
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Return a firebase namespace object.
     *
     * In production, this will be called exactly once and the result
     * assigned to the 'firebase' global.  It may be called multiple times
     * in unit tests.
     */
    function createFirebaseNamespace() {
        var namespace = createFirebaseNamespaceCore(FirebaseAppImpl);
        namespace.INTERNAL = tslib_es6.__assign(tslib_es6.__assign({}, namespace.INTERNAL), { createFirebaseNamespace: createFirebaseNamespace,
            extendNamespace: extendNamespace,
            createSubscribe: index_cjs.createSubscribe,
            ErrorFactory: index_cjs.ErrorFactory,
            deepExtend: index_cjs.deepExtend });
        /**
         * Patch the top-level firebase namespace with additional properties.
         *
         * firebase.INTERNAL.extendNamespace()
         */
        function extendNamespace(props) {
            index_cjs.deepExtend(namespace, props);
        }
        return namespace;
    }
    var firebase = createFirebaseNamespace();

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var PlatformLoggerService = /** @class */ (function () {
        function PlatformLoggerService(container) {
            this.container = container;
        }
        // In initial implementation, this will be called by installations on
        // auth token refresh, and installations will send this string.
        PlatformLoggerService.prototype.getPlatformInfoString = function () {
            var providers = this.container.getProviders();
            // Loop through providers and get library/version pairs from any that are
            // version components.
            return providers
                .map(function (provider) {
                if (isVersionServiceProvider(provider)) {
                    var service = provider.getImmediate();
                    return service.library + "/" + service.version;
                }
                else {
                    return null;
                }
            })
                .filter(function (logString) { return logString; })
                .join(' ');
        };
        return PlatformLoggerService;
    }());
    /**
     *
     * @param provider check if this provider provides a VersionService
     *
     * NOTE: Using Provider<'app-version'> is a hack to indicate that the provider
     * provides VersionService. The provider is not necessarily a 'app-version'
     * provider.
     */
    function isVersionServiceProvider(provider) {
        var component = provider.getComponent();
        return (component === null || component === void 0 ? void 0 : component.type) === "VERSION" /* VERSION */;
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    function registerCoreComponents(firebase, variant) {
        firebase.INTERNAL.registerComponent(new index_cjs$1.Component('platform-logger', function (container) { return new PlatformLoggerService(container); }, "PRIVATE" /* PRIVATE */));
        // Register `app` package.
        firebase.registerVersion(name$1, version, variant);
        // Register platform SDK identifier (no version).
        firebase.registerVersion('fire-js', '');
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // Firebase Lite detection test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (index_cjs.isBrowser() && self.firebase !== undefined) {
        logger.warn("\n    Warning: Firebase is already defined in the global scope. Please make sure\n    Firebase library is only loaded once.\n  ");
        // eslint-disable-next-line
        var sdkVersion = self.firebase.SDK_VERSION;
        if (sdkVersion && sdkVersion.indexOf('LITE') >= 0) {
            logger.warn("\n    Warning: You are trying to load Firebase while using Firebase Performance standalone script.\n    You should load Firebase Performance with this instance of Firebase to avoid loading duplicate code.\n    ");
        }
    }
    var initializeApp = firebase.initializeApp;
    // TODO: This disable can be removed and the 'ignoreRestArgs' option added to
    // the no-explicit-any rule when ESlint releases it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firebase.initializeApp = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        // Environment check before initializing app
        // Do the check in initializeApp, so people have a chance to disable it by setting logLevel
        // in @firebase/logger
        if (index_cjs.isNode()) {
            logger.warn("\n      Warning: This is a browser-targeted Firebase bundle but it appears it is being\n      run in a Node environment.  If running in a Node environment, make sure you\n      are using the bundle specified by the \"main\" field in package.json.\n      \n      If you are using Webpack, you can specify \"main\" as the first item in\n      \"resolve.mainFields\":\n      https://webpack.js.org/configuration/resolve/#resolvemainfields\n      \n      If using Rollup, use the rollup-plugin-node-resolve plugin and specify \"main\"\n      as the first item in \"mainFields\", e.g. ['main', 'module'].\n      https://github.com/rollup/rollup-plugin-node-resolve\n      ");
        }
        return initializeApp.apply(undefined, args);
    };
    var firebase$1 = firebase;
    registerCoreComponents(firebase$1);

    exports.default = firebase$1;
    exports.firebase = firebase$1;

    });

    function _interopDefaultLegacy$1 (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var firebase__default = /*#__PURE__*/_interopDefaultLegacy$1(index_cjs$2);

    var name$1 = "firebase";
    var version = "7.24.0";

    /**
     * @license
     * Copyright 2018 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    firebase__default['default'].registerVersion(name$1, version, 'app');

    var index_cjs$3 = firebase__default['default'];

    var firebase = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.assign(/*#__PURE__*/Object.create(null), index_cjs$3, {
        'default': index_cjs$3,
        __moduleExports: index_cjs$3
    }));

    (function() {var firebase = index_cjs$2.default;/*

     Copyright The Closure Library Authors.
     SPDX-License-Identifier: Apache-2.0
    */
    var k,aa="function"==typeof Object.defineProperties?Object.defineProperty:function(a,b,c){a!=Array.prototype&&a!=Object.prototype&&(a[b]=c.value);};function ba(a){a=["object"==typeof window&&window,"object"==typeof self&&self,"object"==typeof commonjsGlobal&&commonjsGlobal,a];for(var b=0;b<a.length;++b){var c=a[b];if(c&&c.Math==Math)return c}return globalThis}var ca=ba(this);
    function da(a,b){if(b){var c=ca;a=a.split(".");for(var d=0;d<a.length-1;d++){var e=a[d];e in c||(c[e]={});c=c[e];}a=a[a.length-1];d=c[a];b=b(d);b!=d&&null!=b&&aa(c,a,{configurable:!0,writable:!0,value:b});}}function ea(a){var b=0;return function(){return b<a.length?{done:!1,value:a[b++]}:{done:!0}}}function fa(a){var b="undefined"!=typeof Symbol&&Symbol.iterator&&a[Symbol.iterator];return b?b.call(a):{next:ea(a)}}
    da("Promise",function(a){function b(g){this.b=0;this.c=void 0;this.a=[];var h=this.f();try{g(h.resolve,h.reject);}catch(m){h.reject(m);}}function c(){this.a=null;}function d(g){return g instanceof b?g:new b(function(h){h(g);})}if(a)return a;c.prototype.b=function(g){if(null==this.a){this.a=[];var h=this;this.c(function(){h.g();});}this.a.push(g);};var e=ca.setTimeout;c.prototype.c=function(g){e(g,0);};c.prototype.g=function(){for(;this.a&&this.a.length;){var g=this.a;this.a=[];for(var h=0;h<g.length;++h){var m=
    g[h];g[h]=null;try{m();}catch(p){this.f(p);}}}this.a=null;};c.prototype.f=function(g){this.c(function(){throw g;});};b.prototype.f=function(){function g(p){return function(v){m||(m=!0,p.call(h,v));}}var h=this,m=!1;return {resolve:g(this.v),reject:g(this.g)}};b.prototype.v=function(g){if(g===this)this.g(new TypeError("A Promise cannot resolve to itself"));else if(g instanceof b)this.o(g);else {a:switch(typeof g){case "object":var h=null!=g;break a;case "function":h=!0;break a;default:h=!1;}h?this.m(g):this.h(g);}};
    b.prototype.m=function(g){var h=void 0;try{h=g.then;}catch(m){this.g(m);return}"function"==typeof h?this.u(h,g):this.h(g);};b.prototype.g=function(g){this.i(2,g);};b.prototype.h=function(g){this.i(1,g);};b.prototype.i=function(g,h){if(0!=this.b)throw Error("Cannot settle("+g+", "+h+"): Promise already settled in state"+this.b);this.b=g;this.c=h;this.l();};b.prototype.l=function(){if(null!=this.a){for(var g=0;g<this.a.length;++g)f.b(this.a[g]);this.a=null;}};var f=new c;b.prototype.o=function(g){var h=this.f();
    g.Pa(h.resolve,h.reject);};b.prototype.u=function(g,h){var m=this.f();try{g.call(h,m.resolve,m.reject);}catch(p){m.reject(p);}};b.prototype.then=function(g,h){function m(A,Q){return "function"==typeof A?function(xa){try{p(A(xa));}catch(yd){v(yd);}}:Q}var p,v,B=new b(function(A,Q){p=A;v=Q;});this.Pa(m(g,p),m(h,v));return B};b.prototype.catch=function(g){return this.then(void 0,g)};b.prototype.Pa=function(g,h){function m(){switch(p.b){case 1:g(p.c);break;case 2:h(p.c);break;default:throw Error("Unexpected state: "+
    p.b);}}var p=this;null==this.a?f.b(m):this.a.push(m);};b.resolve=d;b.reject=function(g){return new b(function(h,m){m(g);})};b.race=function(g){return new b(function(h,m){for(var p=fa(g),v=p.next();!v.done;v=p.next())d(v.value).Pa(h,m);})};b.all=function(g){var h=fa(g),m=h.next();return m.done?d([]):new b(function(p,v){function B(xa){return function(yd){A[xa]=yd;Q--;0==Q&&p(A);}}var A=[],Q=0;do A.push(void 0),Q++,d(m.value).Pa(B(A.length-1),v),m=h.next();while(!m.done)})};return b});
    var ha=ha||{},l=this||self,ia=/^[\w+/_-]+[=]{0,2}$/,ja=null;function ka(){}
    function la(a){var b=typeof a;if("object"==b)if(a){if(a instanceof Array)return "array";if(a instanceof Object)return b;var c=Object.prototype.toString.call(a);if("[object Window]"==c)return "object";if("[object Array]"==c||"number"==typeof a.length&&"undefined"!=typeof a.splice&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("splice"))return "array";if("[object Function]"==c||"undefined"!=typeof a.call&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("call"))return "function"}else return "null";
    else if("function"==b&&"undefined"==typeof a.call)return "object";return b}function ma(a){var b=la(a);return "array"==b||"object"==b&&"number"==typeof a.length}function na(a){return "function"==la(a)}function n(a){var b=typeof a;return "object"==b&&null!=a||"function"==b}function oa(a){return Object.prototype.hasOwnProperty.call(a,pa)&&a[pa]||(a[pa]=++qa)}var pa="closure_uid_"+(1E9*Math.random()>>>0),qa=0;function ra(a,b,c){return a.call.apply(a.bind,arguments)}
    function sa(a,b,c){if(!a)throw Error();if(2<arguments.length){var d=Array.prototype.slice.call(arguments,2);return function(){var e=Array.prototype.slice.call(arguments);Array.prototype.unshift.apply(e,d);return a.apply(b,e)}}return function(){return a.apply(b,arguments)}}function q(a,b,c){Function.prototype.bind&&-1!=Function.prototype.bind.toString().indexOf("native code")?q=ra:q=sa;return q.apply(null,arguments)}
    function ta(a,b){var c=Array.prototype.slice.call(arguments,1);return function(){var d=c.slice();d.push.apply(d,arguments);return a.apply(this,d)}}var ua=Date.now||function(){return +new Date};function r(a,b){function c(){}c.prototype=b.prototype;a.$a=b.prototype;a.prototype=new c;a.prototype.constructor=a;}function t(a,b,c){this.code=va+a;this.message=b||wa[a]||"";this.a=c||null;}r(t,Error);t.prototype.w=function(){var a={code:this.code,message:this.message};this.a&&(a.serverResponse=this.a);return a};t.prototype.toJSON=function(){return this.w()};function ya(a){var b=a&&a.code;return b?new t(b.substring(va.length),a.message,a.serverResponse):null}
    var va="auth/",wa={"admin-restricted-operation":"This operation is restricted to administrators only.","argument-error":"","app-not-authorized":"This app, identified by the domain where it's hosted, is not authorized to use Firebase Authentication with the provided API key. Review your key configuration in the Google API console.","app-not-installed":"The requested mobile application corresponding to the identifier (Android package name or iOS bundle ID) provided is not installed on this device.",
    "captcha-check-failed":"The reCAPTCHA response token provided is either invalid, expired, already used or the domain associated with it does not match the list of whitelisted domains.","code-expired":"The SMS code has expired. Please re-send the verification code to try again.","cordova-not-ready":"Cordova framework is not ready.","cors-unsupported":"This browser is not supported.","credential-already-in-use":"This credential is already associated with a different user account.","custom-token-mismatch":"The custom token corresponds to a different audience.",
    "requires-recent-login":"This operation is sensitive and requires recent authentication. Log in again before retrying this request.","dynamic-link-not-activated":"Please activate Dynamic Links in the Firebase Console and agree to the terms and conditions.","email-change-needs-verification":"Multi-factor users must always have a verified email.","email-already-in-use":"The email address is already in use by another account.","expired-action-code":"The action code has expired. ","cancelled-popup-request":"This operation has been cancelled due to another conflicting popup being opened.",
    "internal-error":"An internal error has occurred.","invalid-app-credential":"The phone verification request contains an invalid application verifier. The reCAPTCHA token response is either invalid or expired.","invalid-app-id":"The mobile app identifier is not registed for the current project.","invalid-user-token":"This user's credential isn't valid for this project. This can happen if the user's token has been tampered with, or if the user isn't for the project associated with this API key.","invalid-auth-event":"An internal error has occurred.",
    "invalid-verification-code":"The SMS verification code used to create the phone auth credential is invalid. Please resend the verification code sms and be sure use the verification code provided by the user.","invalid-continue-uri":"The continue URL provided in the request is invalid.","invalid-cordova-configuration":"The following Cordova plugins must be installed to enable OAuth sign-in: cordova-plugin-buildinfo, cordova-universal-links-plugin, cordova-plugin-browsertab, cordova-plugin-inappbrowser and cordova-plugin-customurlscheme.",
    "invalid-custom-token":"The custom token format is incorrect. Please check the documentation.","invalid-dynamic-link-domain":"The provided dynamic link domain is not configured or authorized for the current project.","invalid-email":"The email address is badly formatted.","invalid-api-key":"Your API key is invalid, please check you have copied it correctly.","invalid-cert-hash":"The SHA-1 certificate hash provided is invalid.","invalid-credential":"The supplied auth credential is malformed or has expired.",
    "invalid-message-payload":"The email template corresponding to this action contains invalid characters in its message. Please fix by going to the Auth email templates section in the Firebase Console.","invalid-multi-factor-session":"The request does not contain a valid proof of first factor successful sign-in.","invalid-oauth-provider":"EmailAuthProvider is not supported for this operation. This operation only supports OAuth providers.","invalid-oauth-client-id":"The OAuth client ID provided is either invalid or does not match the specified API key.",
    "unauthorized-domain":"This domain is not authorized for OAuth operations for your Firebase project. Edit the list of authorized domains from the Firebase console.","invalid-action-code":"The action code is invalid. This can happen if the code is malformed, expired, or has already been used.","wrong-password":"The password is invalid or the user does not have a password.","invalid-persistence-type":"The specified persistence type is invalid. It can only be local, session or none.","invalid-phone-number":"The format of the phone number provided is incorrect. Please enter the phone number in a format that can be parsed into E.164 format. E.164 phone numbers are written in the format [+][country code][subscriber number including area code].",
    "invalid-provider-id":"The specified provider ID is invalid.","invalid-recipient-email":"The email corresponding to this action failed to send as the provided recipient email address is invalid.","invalid-sender":"The email template corresponding to this action contains an invalid sender email or name. Please fix by going to the Auth email templates section in the Firebase Console.","invalid-verification-id":"The verification ID used to create the phone auth credential is invalid.","invalid-tenant-id":"The Auth instance's tenant ID is invalid.",
    "multi-factor-info-not-found":"The user does not have a second factor matching the identifier provided.","multi-factor-auth-required":"Proof of ownership of a second factor is required to complete sign-in.","missing-android-pkg-name":"An Android Package Name must be provided if the Android App is required to be installed.","auth-domain-config-required":"Be sure to include authDomain when calling firebase.initializeApp(), by following the instructions in the Firebase console.","missing-app-credential":"The phone verification request is missing an application verifier assertion. A reCAPTCHA response token needs to be provided.",
    "missing-verification-code":"The phone auth credential was created with an empty SMS verification code.","missing-continue-uri":"A continue URL must be provided in the request.","missing-iframe-start":"An internal error has occurred.","missing-ios-bundle-id":"An iOS Bundle ID must be provided if an App Store ID is provided.","missing-multi-factor-info":"No second factor identifier is provided.","missing-multi-factor-session":"The request is missing proof of first factor successful sign-in.","missing-or-invalid-nonce":"The request does not contain a valid nonce. This can occur if the SHA-256 hash of the provided raw nonce does not match the hashed nonce in the ID token payload.",
    "missing-phone-number":"To send verification codes, provide a phone number for the recipient.","missing-verification-id":"The phone auth credential was created with an empty verification ID.","app-deleted":"This instance of FirebaseApp has been deleted.","account-exists-with-different-credential":"An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.","network-request-failed":"A network error (such as timeout, interrupted connection or unreachable host) has occurred.",
    "no-auth-event":"An internal error has occurred.","no-such-provider":"User was not linked to an account with the given provider.","null-user":"A null user object was provided as the argument for an operation which requires a non-null user object.","operation-not-allowed":"The given sign-in provider is disabled for this Firebase project. Enable it in the Firebase console, under the sign-in method tab of the Auth section.","operation-not-supported-in-this-environment":'This operation is not supported in the environment this application is running on. "location.protocol" must be http, https or chrome-extension and web storage must be enabled.',
    "popup-blocked":"Unable to establish a connection with the popup. It may have been blocked by the browser.","popup-closed-by-user":"The popup has been closed by the user before finalizing the operation.","provider-already-linked":"User can only be linked to one identity for the given provider.","quota-exceeded":"The project's quota for this operation has been exceeded.","redirect-cancelled-by-user":"The redirect operation has been cancelled by the user before finalizing.","redirect-operation-pending":"A redirect sign-in operation is already pending.",
    "rejected-credential":"The request contains malformed or mismatching credentials.","second-factor-already-in-use":"The second factor is already enrolled on this account.","maximum-second-factor-count-exceeded":"The maximum allowed number of second factors on a user has been exceeded.","tenant-id-mismatch":"The provided tenant ID does not match the Auth instance's tenant ID",timeout:"The operation has timed out.","user-token-expired":"The user's credential is no longer valid. The user must sign in again.",
    "too-many-requests":"We have blocked all requests from this device due to unusual activity. Try again later.","unauthorized-continue-uri":"The domain of the continue URL is not whitelisted.  Please whitelist the domain in the Firebase console.","unsupported-first-factor":"Enrolling a second factor or signing in with a multi-factor account requires sign-in with a supported first factor.","unsupported-persistence-type":"The current environment does not support the specified persistence type.","unsupported-tenant-operation":"This operation is not supported in a multi-tenant context.",
    "unverified-email":"The operation requires a verified email.","user-cancelled":"The user did not grant your application the permissions it requested.","user-not-found":"There is no user record corresponding to this identifier. The user may have been deleted.","user-disabled":"The user account has been disabled by an administrator.","user-mismatch":"The supplied credentials do not correspond to the previously signed in user.","user-signed-out":"","weak-password":"The password must be 6 characters long or more.",
    "web-storage-unsupported":"This browser is not supported or 3rd party cookies and data may be disabled."};var za={kd:{Sa:"https://staging-identitytoolkit.sandbox.googleapis.com/identitytoolkit/v3/relyingparty/",Ya:"https://staging-securetoken.sandbox.googleapis.com/v1/token",Va:"https://staging-identitytoolkit.sandbox.googleapis.com/v2/",id:"b"},rd:{Sa:"https://www.googleapis.com/identitytoolkit/v3/relyingparty/",Ya:"https://securetoken.googleapis.com/v1/token",Va:"https://identitytoolkit.googleapis.com/v2/",id:"p"},td:{Sa:"https://staging-www.sandbox.googleapis.com/identitytoolkit/v3/relyingparty/",
    Ya:"https://staging-securetoken.sandbox.googleapis.com/v1/token",Va:"https://staging-identitytoolkit.sandbox.googleapis.com/v2/",id:"s"},ud:{Sa:"https://www-googleapis-test.sandbox.google.com/identitytoolkit/v3/relyingparty/",Ya:"https://test-securetoken.sandbox.googleapis.com/v1/token",Va:"https://test-identitytoolkit.sandbox.googleapis.com/v2/",id:"t"}};
    function Aa(a){for(var b in za)if(za[b].id===a)return a=za[b],{firebaseEndpoint:a.Sa,secureTokenEndpoint:a.Ya,identityPlatformEndpoint:a.Va};return null}var Ba;Ba=Aa("__EID__")?"__EID__":void 0;function Ca(a){if(!a)return !1;try{return !!a.$goog_Thenable}catch(b){return !1}}function u(a){if(Error.captureStackTrace)Error.captureStackTrace(this,u);else {var b=Error().stack;b&&(this.stack=b);}a&&(this.message=String(a));}r(u,Error);u.prototype.name="CustomError";function Da(a,b){a=a.split("%s");for(var c="",d=a.length-1,e=0;e<d;e++)c+=a[e]+(e<b.length?b[e]:"%s");u.call(this,c+a[d]);}r(Da,u);Da.prototype.name="AssertionError";function Ea(a,b){throw new Da("Failure"+(a?": "+a:""),Array.prototype.slice.call(arguments,1));}function Fa(a,b){this.c=a;this.f=b;this.b=0;this.a=null;}Fa.prototype.get=function(){if(0<this.b){this.b--;var a=this.a;this.a=a.next;a.next=null;}else a=this.c();return a};function Ga(a,b){a.f(b);100>a.b&&(a.b++,b.next=a.a,a.a=b);}function Ha(){this.b=this.a=null;}var Ja=new Fa(function(){return new Ia},function(a){a.reset();});Ha.prototype.add=function(a,b){var c=Ja.get();c.set(a,b);this.b?this.b.next=c:this.a=c;this.b=c;};function Ka(){var a=La,b=null;a.a&&(b=a.a,a.a=a.a.next,a.a||(a.b=null),b.next=null);return b}function Ia(){this.next=this.b=this.a=null;}Ia.prototype.set=function(a,b){this.a=a;this.b=b;this.next=null;};Ia.prototype.reset=function(){this.next=this.b=this.a=null;};var Ma=Array.prototype.indexOf?function(a,b){return Array.prototype.indexOf.call(a,b,void 0)}:function(a,b){if("string"===typeof a)return "string"!==typeof b||1!=b.length?-1:a.indexOf(b,0);for(var c=0;c<a.length;c++)if(c in a&&a[c]===b)return c;return -1},w=Array.prototype.forEach?function(a,b,c){Array.prototype.forEach.call(a,b,c);}:function(a,b,c){for(var d=a.length,e="string"===typeof a?a.split(""):a,f=0;f<d;f++)f in e&&b.call(c,e[f],f,a);};
    function Na(a,b){for(var c="string"===typeof a?a.split(""):a,d=a.length-1;0<=d;--d)d in c&&b.call(void 0,c[d],d,a);}
    var Oa=Array.prototype.filter?function(a,b){return Array.prototype.filter.call(a,b,void 0)}:function(a,b){for(var c=a.length,d=[],e=0,f="string"===typeof a?a.split(""):a,g=0;g<c;g++)if(g in f){var h=f[g];b.call(void 0,h,g,a)&&(d[e++]=h);}return d},Pa=Array.prototype.map?function(a,b){return Array.prototype.map.call(a,b,void 0)}:function(a,b){for(var c=a.length,d=Array(c),e="string"===typeof a?a.split(""):a,f=0;f<c;f++)f in e&&(d[f]=b.call(void 0,e[f],f,a));return d},Qa=Array.prototype.some?function(a,
    b){return Array.prototype.some.call(a,b,void 0)}:function(a,b){for(var c=a.length,d="string"===typeof a?a.split(""):a,e=0;e<c;e++)if(e in d&&b.call(void 0,d[e],e,a))return !0;return !1};function Ra(a){a:{var b=Sa;for(var c=a.length,d="string"===typeof a?a.split(""):a,e=0;e<c;e++)if(e in d&&b.call(void 0,d[e],e,a)){b=e;break a}b=-1;}return 0>b?null:"string"===typeof a?a.charAt(b):a[b]}function Ta(a,b){return 0<=Ma(a,b)}
    function Ua(a,b){b=Ma(a,b);var c;(c=0<=b)&&Array.prototype.splice.call(a,b,1);return c}function Va(a,b){var c=0;Na(a,function(d,e){b.call(void 0,d,e,a)&&1==Array.prototype.splice.call(a,e,1).length&&c++;});}function Wa(a){return Array.prototype.concat.apply([],arguments)}function Xa(a){var b=a.length;if(0<b){for(var c=Array(b),d=0;d<b;d++)c[d]=a[d];return c}return []}var Ya=String.prototype.trim?function(a){return a.trim()}:function(a){return /^[\s\xa0]*([\s\S]*?)[\s\xa0]*$/.exec(a)[1]},Za=/&/g,$a=/</g,ab=/>/g,bb=/"/g,cb=/'/g,db=/\x00/g,eb=/[\x00&<>"']/;function x(a,b){return -1!=a.indexOf(b)}function fb(a,b){return a<b?-1:a>b?1:0}var gb;a:{var hb=l.navigator;if(hb){var ib=hb.userAgent;if(ib){gb=ib;break a}}gb="";}function y(a){return x(gb,a)}function jb(a,b){for(var c in a)b.call(void 0,a[c],c,a);}function kb(a){for(var b in a)return !1;return !0}function lb(a){var b={},c;for(c in a)b[c]=a[c];return b}var mb="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function z(a,b){for(var c,d,e=1;e<arguments.length;e++){d=arguments[e];for(c in d)a[c]=d[c];for(var f=0;f<mb.length;f++)c=mb[f],Object.prototype.hasOwnProperty.call(d,c)&&(a[c]=d[c]);}}function nb(a,b){a:{try{var c=a&&a.ownerDocument,d=c&&(c.defaultView||c.parentWindow);d=d||l;if(d.Element&&d.Location){var e=d;break a}}catch(g){}e=null;}if(e&&"undefined"!=typeof e[b]&&(!a||!(a instanceof e[b])&&(a instanceof e.Location||a instanceof e.Element))){if(n(a))try{var f=a.constructor.displayName||a.constructor.name||Object.prototype.toString.call(a);}catch(g){f="<object could not be stringified>";}else f=void 0===a?"undefined":null===a?"null":typeof a;Ea("Argument is not a %s (or a non-Element, non-Location mock); got: %s",
    b,f);}}function ob(a,b){this.a=a===pb&&b||"";this.b=qb;}ob.prototype.sa=!0;ob.prototype.ra=function(){return this.a};ob.prototype.toString=function(){return "Const{"+this.a+"}"};function rb(a){if(a instanceof ob&&a.constructor===ob&&a.b===qb)return a.a;Ea("expected object of type Const, got '"+a+"'");return "type_error:Const"}var qb={},pb={},sb=new ob(pb,"");function tb(a,b){this.a=a===ub&&b||"";this.b=vb;}tb.prototype.sa=!0;tb.prototype.ra=function(){return this.a.toString()};tb.prototype.toString=function(){return "TrustedResourceUrl{"+this.a+"}"};function wb(a){if(a instanceof tb&&a.constructor===tb&&a.b===vb)return a.a;Ea("expected object of type TrustedResourceUrl, got '"+a+"' of type "+la(a));return "type_error:TrustedResourceUrl"}
    function xb(a,b){var c=rb(a);if(!yb.test(c))throw Error("Invalid TrustedResourceUrl format: "+c);a=c.replace(zb,function(d,e){if(!Object.prototype.hasOwnProperty.call(b,e))throw Error('Found marker, "'+e+'", in format string, "'+c+'", but no valid label mapping found in args: '+JSON.stringify(b));d=b[e];return d instanceof ob?rb(d):encodeURIComponent(String(d))});return new tb(ub,a)}
    var zb=/%{(\w+)}/g,yb=/^((https:)?\/\/[0-9a-z.:[\]-]+\/|\/[^/\\]|[^:/\\%]+\/|[^:/\\%]*[?#]|about:blank#)/i,vb={},ub={};function Ab(a,b){this.a=a===Bb&&b||"";this.b=Cb;}Ab.prototype.sa=!0;Ab.prototype.ra=function(){return this.a.toString()};Ab.prototype.toString=function(){return "SafeUrl{"+this.a+"}"};function Db(a){if(a instanceof Ab&&a.constructor===Ab&&a.b===Cb)return a.a;Ea("expected object of type SafeUrl, got '"+a+"' of type "+la(a));return "type_error:SafeUrl"}var Eb=/^(?:(?:https?|mailto|ftp):|[^:/?#]*(?:[/?#]|$))/i;
    function Fb(a){if(a instanceof Ab)return a;a="object"==typeof a&&a.sa?a.ra():String(a);Eb.test(a)||(a="about:invalid#zClosurez");return new Ab(Bb,a)}var Cb={},Bb={};function Gb(){this.a="";this.b=Hb;}Gb.prototype.sa=!0;Gb.prototype.ra=function(){return this.a.toString()};Gb.prototype.toString=function(){return "SafeHtml{"+this.a+"}"};function Ib(a){if(a instanceof Gb&&a.constructor===Gb&&a.b===Hb)return a.a;Ea("expected object of type SafeHtml, got '"+a+"' of type "+la(a));return "type_error:SafeHtml"}var Hb={};function Jb(a){var b=new Gb;b.a=a;return b}Jb("<!DOCTYPE html>");var Kb=Jb("");Jb("<br>");function Lb(a){var b=new tb(ub,rb(sb));nb(a,"HTMLIFrameElement");a.src=wb(b).toString();}function Mb(a,b){nb(a,"HTMLScriptElement");a.src=wb(b);if(null===ja)b:{b=l.document;if((b=b.querySelector&&b.querySelector("script[nonce]"))&&(b=b.nonce||b.getAttribute("nonce"))&&ia.test(b)){ja=b;break b}ja="";}b=ja;b&&a.setAttribute("nonce",b);}function Nb(a,b){for(var c=a.split("%s"),d="",e=Array.prototype.slice.call(arguments,1);e.length&&1<c.length;)d+=c.shift()+e.shift();return d+c.join("%s")}function Ob(a){eb.test(a)&&(-1!=a.indexOf("&")&&(a=a.replace(Za,"&amp;")),-1!=a.indexOf("<")&&(a=a.replace($a,"&lt;")),-1!=a.indexOf(">")&&(a=a.replace(ab,"&gt;")),-1!=a.indexOf('"')&&(a=a.replace(bb,"&quot;")),-1!=a.indexOf("'")&&(a=a.replace(cb,"&#39;")),-1!=a.indexOf("\x00")&&(a=a.replace(db,"&#0;")));return a}function Pb(a){Pb[" "](a);return a}Pb[" "]=ka;function Qb(a,b){var c=Rb;return Object.prototype.hasOwnProperty.call(c,a)?c[a]:c[a]=b(a)}var Sb=y("Opera"),Tb=y("Trident")||y("MSIE"),Ub=y("Edge"),Vb=Ub||Tb,Wb=y("Gecko")&&!(x(gb.toLowerCase(),"webkit")&&!y("Edge"))&&!(y("Trident")||y("MSIE"))&&!y("Edge"),Xb=x(gb.toLowerCase(),"webkit")&&!y("Edge");function Yb(){var a=l.document;return a?a.documentMode:void 0}var Zb;
    a:{var $b="",ac=function(){var a=gb;if(Wb)return /rv:([^\);]+)(\)|;)/.exec(a);if(Ub)return /Edge\/([\d\.]+)/.exec(a);if(Tb)return /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/.exec(a);if(Xb)return /WebKit\/(\S+)/.exec(a);if(Sb)return /(?:Version)[ \/]?(\S+)/.exec(a)}();ac&&($b=ac?ac[1]:"");if(Tb){var bc=Yb();if(null!=bc&&bc>parseFloat($b)){Zb=String(bc);break a}}Zb=$b;}var Rb={};
    function cc(a){return Qb(a,function(){for(var b=0,c=Ya(String(Zb)).split("."),d=Ya(String(a)).split("."),e=Math.max(c.length,d.length),f=0;0==b&&f<e;f++){var g=c[f]||"",h=d[f]||"";do{g=/(\d*)(\D*)(.*)/.exec(g)||["","","",""];h=/(\d*)(\D*)(.*)/.exec(h)||["","","",""];if(0==g[0].length&&0==h[0].length)break;b=fb(0==g[1].length?0:parseInt(g[1],10),0==h[1].length?0:parseInt(h[1],10))||fb(0==g[2].length,0==h[2].length)||fb(g[2],h[2]);g=g[3];h=h[3];}while(0==b)}return 0<=b})}var dc;
    dc=l.document&&Tb?Yb():void 0;try{(new self.OffscreenCanvas(0,0)).getContext("2d");}catch(a){}var ec=!Tb||9<=Number(dc);function fc(a){var b=document;return "string"===typeof a?b.getElementById(a):a}function gc(a,b){jb(b,function(c,d){c&&"object"==typeof c&&c.sa&&(c=c.ra());"style"==d?a.style.cssText=c:"class"==d?a.className=c:"for"==d?a.htmlFor=c:hc.hasOwnProperty(d)?a.setAttribute(hc[d],c):0==d.lastIndexOf("aria-",0)||0==d.lastIndexOf("data-",0)?a.setAttribute(d,c):a[d]=c;});}
    var hc={cellpadding:"cellPadding",cellspacing:"cellSpacing",colspan:"colSpan",frameborder:"frameBorder",height:"height",maxlength:"maxLength",nonce:"nonce",role:"role",rowspan:"rowSpan",type:"type",usemap:"useMap",valign:"vAlign",width:"width"};
    function ic(a,b,c){var d=arguments,e=document,f=String(d[0]),g=d[1];if(!ec&&g&&(g.name||g.type)){f=["<",f];g.name&&f.push(' name="',Ob(g.name),'"');if(g.type){f.push(' type="',Ob(g.type),'"');var h={};z(h,g);delete h.type;g=h;}f.push(">");f=f.join("");}f=jc(e,f);g&&("string"===typeof g?f.className=g:Array.isArray(g)?f.className=g.join(" "):gc(f,g));2<d.length&&kc(e,f,d);return f}
    function kc(a,b,c){function d(g){g&&b.appendChild("string"===typeof g?a.createTextNode(g):g);}for(var e=2;e<c.length;e++){var f=c[e];!ma(f)||n(f)&&0<f.nodeType?d(f):w(lc(f)?Xa(f):f,d);}}function jc(a,b){b=String(b);"application/xhtml+xml"===a.contentType&&(b=b.toLowerCase());return a.createElement(b)}function lc(a){if(a&&"number"==typeof a.length){if(n(a))return "function"==typeof a.item||"string"==typeof a.item;if(na(a))return "function"==typeof a.item}return !1}function mc(a){l.setTimeout(function(){throw a;},0);}var nc;
    function oc(){var a=l.MessageChannel;"undefined"===typeof a&&"undefined"!==typeof window&&window.postMessage&&window.addEventListener&&!y("Presto")&&(a=function(){var e=jc(document,"IFRAME");e.style.display="none";Lb(e);document.documentElement.appendChild(e);var f=e.contentWindow;e=f.document;e.open();e.write(Ib(Kb));e.close();var g="callImmediate"+Math.random(),h="file:"==f.location.protocol?"*":f.location.protocol+"//"+f.location.host;e=q(function(m){if(("*"==h||m.origin==h)&&m.data==g)this.port1.onmessage();},
    this);f.addEventListener("message",e,!1);this.port1={};this.port2={postMessage:function(){f.postMessage(g,h);}};});if("undefined"!==typeof a&&!y("Trident")&&!y("MSIE")){var b=new a,c={},d=c;b.port1.onmessage=function(){if(void 0!==c.next){c=c.next;var e=c.Fb;c.Fb=null;e();}};return function(e){d.next={Fb:e};d=d.next;b.port2.postMessage(0);}}return function(e){l.setTimeout(e,0);}}function pc(a,b){qc||rc();sc||(qc(),sc=!0);La.add(a,b);}var qc;function rc(){if(l.Promise&&l.Promise.resolve){var a=l.Promise.resolve(void 0);qc=function(){a.then(tc);};}else qc=function(){var b=tc;!na(l.setImmediate)||l.Window&&l.Window.prototype&&!y("Edge")&&l.Window.prototype.setImmediate==l.setImmediate?(nc||(nc=oc()),nc(b)):l.setImmediate(b);};}var sc=!1,La=new Ha;function tc(){for(var a;a=Ka();){try{a.a.call(a.b);}catch(b){mc(b);}Ga(Ja,a);}sc=!1;}function C(a,b){this.a=uc;this.i=void 0;this.f=this.b=this.c=null;this.g=this.h=!1;if(a!=ka)try{var c=this;a.call(b,function(d){vc(c,wc,d);},function(d){if(!(d instanceof xc))try{if(d instanceof Error)throw d;throw Error("Promise rejected.");}catch(e){}vc(c,yc,d);});}catch(d){vc(this,yc,d);}}var uc=0,wc=2,yc=3;function zc(){this.next=this.f=this.b=this.g=this.a=null;this.c=!1;}zc.prototype.reset=function(){this.f=this.b=this.g=this.a=null;this.c=!1;};var Ac=new Fa(function(){return new zc},function(a){a.reset();});
    function Bc(a,b,c){var d=Ac.get();d.g=a;d.b=b;d.f=c;return d}function D(a){if(a instanceof C)return a;var b=new C(ka);vc(b,wc,a);return b}function E(a){return new C(function(b,c){c(a);})}function Cc(a,b,c){Dc(a,b,c,null)||pc(ta(b,a));}function Ec(a){return new C(function(b,c){var d=a.length,e=[];if(d)for(var f=function(p,v){d--;e[p]=v;0==d&&b(e);},g=function(p){c(p);},h=0,m;h<a.length;h++)m=a[h],Cc(m,ta(f,h),g);else b(e);})}
    function Fc(a){return new C(function(b){var c=a.length,d=[];if(c)for(var e=function(h,m,p){c--;d[h]=m?{Ob:!0,value:p}:{Ob:!1,reason:p};0==c&&b(d);},f=0,g;f<a.length;f++)g=a[f],Cc(g,ta(e,f,!0),ta(e,f,!1));else b(d);})}C.prototype.then=function(a,b,c){return Gc(this,na(a)?a:null,na(b)?b:null,c)};C.prototype.$goog_Thenable=!0;k=C.prototype;k.na=function(a,b){a=Bc(a,a,b);a.c=!0;Hc(this,a);return this};k.s=function(a,b){return Gc(this,null,a,b)};
    k.cancel=function(a){if(this.a==uc){var b=new xc(a);pc(function(){Ic(this,b);},this);}};function Ic(a,b){if(a.a==uc)if(a.c){var c=a.c;if(c.b){for(var d=0,e=null,f=null,g=c.b;g&&(g.c||(d++,g.a==a&&(e=g),!(e&&1<d)));g=g.next)e||(f=g);e&&(c.a==uc&&1==d?Ic(c,b):(f?(d=f,d.next==c.f&&(c.f=d),d.next=d.next.next):Jc(c),Kc(c,e,yc,b)));}a.c=null;}else vc(a,yc,b);}function Hc(a,b){a.b||a.a!=wc&&a.a!=yc||Lc(a);a.f?a.f.next=b:a.b=b;a.f=b;}
    function Gc(a,b,c,d){var e=Bc(null,null,null);e.a=new C(function(f,g){e.g=b?function(h){try{var m=b.call(d,h);f(m);}catch(p){g(p);}}:f;e.b=c?function(h){try{var m=c.call(d,h);void 0===m&&h instanceof xc?g(h):f(m);}catch(p){g(p);}}:g;});e.a.c=a;Hc(a,e);return e.a}k.Zc=function(a){this.a=uc;vc(this,wc,a);};k.$c=function(a){this.a=uc;vc(this,yc,a);};
    function vc(a,b,c){a.a==uc&&(a===c&&(b=yc,c=new TypeError("Promise cannot resolve to itself")),a.a=1,Dc(c,a.Zc,a.$c,a)||(a.i=c,a.a=b,a.c=null,Lc(a),b!=yc||c instanceof xc||Mc(a,c)));}function Dc(a,b,c,d){if(a instanceof C)return Hc(a,Bc(b||ka,c||null,d)),!0;if(Ca(a))return a.then(b,c,d),!0;if(n(a))try{var e=a.then;if(na(e))return Nc(a,e,b,c,d),!0}catch(f){return c.call(d,f),!0}return !1}
    function Nc(a,b,c,d,e){function f(m){h||(h=!0,d.call(e,m));}function g(m){h||(h=!0,c.call(e,m));}var h=!1;try{b.call(a,g,f);}catch(m){f(m);}}function Lc(a){a.h||(a.h=!0,pc(a.fc,a));}function Jc(a){var b=null;a.b&&(b=a.b,a.b=b.next,b.next=null);a.b||(a.f=null);return b}k.fc=function(){for(var a;a=Jc(this);)Kc(this,a,this.a,this.i);this.h=!1;};
    function Kc(a,b,c,d){if(c==yc&&b.b&&!b.c)for(;a&&a.g;a=a.c)a.g=!1;if(b.a)b.a.c=null,Oc(b,c,d);else try{b.c?b.g.call(b.f):Oc(b,c,d);}catch(e){Pc.call(null,e);}Ga(Ac,b);}function Oc(a,b,c){b==wc?a.g.call(a.f,c):a.b&&a.b.call(a.f,c);}function Mc(a,b){a.g=!0;pc(function(){a.g&&Pc.call(null,b);});}var Pc=mc;function xc(a){u.call(this,a);}r(xc,u);xc.prototype.name="cancel";function Qc(){this.xa=this.xa;this.oa=this.oa;}var Rc=0;Qc.prototype.xa=!1;function Tc(a){if(!a.xa&&(a.xa=!0,a.Da(),0!=Rc)){var b=oa(a);}}Qc.prototype.Da=function(){if(this.oa)for(;this.oa.length;)this.oa.shift()();};var Uc=Object.freeze||function(a){return a};var Vc=!Tb||9<=Number(dc),Wc=Tb&&!cc("9"),Xc=function(){if(!l.addEventListener||!Object.defineProperty)return !1;var a=!1,b=Object.defineProperty({},"passive",{get:function(){a=!0;}});try{l.addEventListener("test",ka,b),l.removeEventListener("test",ka,b);}catch(c){}return a}();function F(a,b){this.type=a;this.b=this.target=b;this.defaultPrevented=!1;}F.prototype.preventDefault=function(){this.defaultPrevented=!0;};function Yc(a,b){F.call(this,a?a.type:"");this.relatedTarget=this.b=this.target=null;this.button=this.screenY=this.screenX=this.clientY=this.clientX=0;this.key="";this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1;this.pointerId=0;this.pointerType="";this.a=null;if(a){var c=this.type=a.type,d=a.changedTouches&&a.changedTouches.length?a.changedTouches[0]:null;this.target=a.target||a.srcElement;this.b=b;if(b=a.relatedTarget){if(Wb){a:{try{Pb(b.nodeName);var e=!0;break a}catch(f){}e=!1;}e||(b=null);}}else "mouseover"==
    c?b=a.fromElement:"mouseout"==c&&(b=a.toElement);this.relatedTarget=b;d?(this.clientX=void 0!==d.clientX?d.clientX:d.pageX,this.clientY=void 0!==d.clientY?d.clientY:d.pageY,this.screenX=d.screenX||0,this.screenY=d.screenY||0):(this.clientX=void 0!==a.clientX?a.clientX:a.pageX,this.clientY=void 0!==a.clientY?a.clientY:a.pageY,this.screenX=a.screenX||0,this.screenY=a.screenY||0);this.button=a.button;this.key=a.key||"";this.ctrlKey=a.ctrlKey;this.altKey=a.altKey;this.shiftKey=a.shiftKey;this.metaKey=
    a.metaKey;this.pointerId=a.pointerId||0;this.pointerType="string"===typeof a.pointerType?a.pointerType:Zc[a.pointerType]||"";this.a=a;a.defaultPrevented&&this.preventDefault();}}r(Yc,F);var Zc=Uc({2:"touch",3:"pen",4:"mouse"});Yc.prototype.preventDefault=function(){Yc.$a.preventDefault.call(this);var a=this.a;if(a.preventDefault)a.preventDefault();else if(a.returnValue=!1,Wc)try{if(a.ctrlKey||112<=a.keyCode&&123>=a.keyCode)a.keyCode=-1;}catch(b){}};Yc.prototype.g=function(){return this.a};var $c="closure_listenable_"+(1E6*Math.random()|0),ad=0;function bd(a,b,c,d,e){this.listener=a;this.proxy=null;this.src=b;this.type=c;this.capture=!!d;this.Ua=e;this.key=++ad;this.va=this.Oa=!1;}function cd(a){a.va=!0;a.listener=null;a.proxy=null;a.src=null;a.Ua=null;}function dd(a){this.src=a;this.a={};this.b=0;}dd.prototype.add=function(a,b,c,d,e){var f=a.toString();a=this.a[f];a||(a=this.a[f]=[],this.b++);var g=ed(a,b,d,e);-1<g?(b=a[g],c||(b.Oa=!1)):(b=new bd(b,this.src,f,!!d,e),b.Oa=c,a.push(b));return b};function fd(a,b){var c=b.type;c in a.a&&Ua(a.a[c],b)&&(cd(b),0==a.a[c].length&&(delete a.a[c],a.b--));}function ed(a,b,c,d){for(var e=0;e<a.length;++e){var f=a[e];if(!f.va&&f.listener==b&&f.capture==!!c&&f.Ua==d)return e}return -1}var gd="closure_lm_"+(1E6*Math.random()|0),hd={};function jd(a,b,c,d,e){if(d&&d.once)kd(a,b,c,d,e);else if(Array.isArray(b))for(var f=0;f<b.length;f++)jd(a,b[f],c,d,e);else c=ld(c),a&&a[$c]?md(a,b,c,n(d)?!!d.capture:!!d,e):nd(a,b,c,!1,d,e);}
    function nd(a,b,c,d,e,f){if(!b)throw Error("Invalid event type");var g=n(e)?!!e.capture:!!e,h=od(a);h||(a[gd]=h=new dd(a));c=h.add(b,c,d,g,f);if(!c.proxy){d=pd();c.proxy=d;d.src=a;d.listener=c;if(a.addEventListener)Xc||(e=g),void 0===e&&(e=!1),a.addEventListener(b.toString(),d,e);else if(a.attachEvent)a.attachEvent(qd(b.toString()),d);else if(a.addListener&&a.removeListener)a.addListener(d);else throw Error("addEventListener and attachEvent are unavailable.");}}
    function pd(){var a=rd,b=Vc?function(c){return a.call(b.src,b.listener,c)}:function(c){c=a.call(b.src,b.listener,c);if(!c)return c};return b}function kd(a,b,c,d,e){if(Array.isArray(b))for(var f=0;f<b.length;f++)kd(a,b[f],c,d,e);else c=ld(c),a&&a[$c]?sd(a,b,c,n(d)?!!d.capture:!!d,e):nd(a,b,c,!0,d,e);}
    function G(a,b,c,d,e){if(Array.isArray(b))for(var f=0;f<b.length;f++)G(a,b[f],c,d,e);else (d=n(d)?!!d.capture:!!d,c=ld(c),a&&a[$c])?(a=a.v,b=String(b).toString(),b in a.a&&(f=a.a[b],c=ed(f,c,d,e),-1<c&&(cd(f[c]),Array.prototype.splice.call(f,c,1),0==f.length&&(delete a.a[b],a.b--)))):a&&(a=od(a))&&(b=a.a[b.toString()],a=-1,b&&(a=ed(b,c,d,e)),(c=-1<a?b[a]:null)&&td(c));}
    function td(a){if("number"!==typeof a&&a&&!a.va){var b=a.src;if(b&&b[$c])fd(b.v,a);else {var c=a.type,d=a.proxy;b.removeEventListener?b.removeEventListener(c,d,a.capture):b.detachEvent?b.detachEvent(qd(c),d):b.addListener&&b.removeListener&&b.removeListener(d);(c=od(b))?(fd(c,a),0==c.b&&(c.src=null,b[gd]=null)):cd(a);}}}function qd(a){return a in hd?hd[a]:hd[a]="on"+a}
    function ud(a,b,c,d){var e=!0;if(a=od(a))if(b=a.a[b.toString()])for(b=b.concat(),a=0;a<b.length;a++){var f=b[a];f&&f.capture==c&&!f.va&&(f=vd(f,d),e=e&&!1!==f);}return e}function vd(a,b){var c=a.listener,d=a.Ua||a.src;a.Oa&&td(a);return c.call(d,b)}
    function rd(a,b){if(a.va)return !0;if(!Vc){if(!b)a:{b=["window","event"];for(var c=l,d=0;d<b.length;d++)if(c=c[b[d]],null==c){b=null;break a}b=c;}d=b;b=new Yc(d,this);c=!0;if(!(0>d.keyCode||void 0!=d.returnValue)){a:{var e=!1;if(0==d.keyCode)try{d.keyCode=-1;break a}catch(g){e=!0;}if(e||void 0==d.returnValue)d.returnValue=!0;}d=[];for(e=b.b;e;e=e.parentNode)d.push(e);a=a.type;for(e=d.length-1;0<=e;e--){b.b=d[e];var f=ud(d[e],a,!0,b);c=c&&f;}for(e=0;e<d.length;e++)b.b=d[e],f=ud(d[e],a,!1,b),c=c&&f;}return c}return vd(a,
    new Yc(b,this))}function od(a){a=a[gd];return a instanceof dd?a:null}var wd="__closure_events_fn_"+(1E9*Math.random()>>>0);function ld(a){if(na(a))return a;a[wd]||(a[wd]=function(b){return a.handleEvent(b)});return a[wd]}function H(){Qc.call(this);this.v=new dd(this);this.$b=this;this.fb=null;}r(H,Qc);H.prototype[$c]=!0;H.prototype.addEventListener=function(a,b,c,d){jd(this,a,b,c,d);};H.prototype.removeEventListener=function(a,b,c,d){G(this,a,b,c,d);};
    H.prototype.dispatchEvent=function(a){var b,c=this.fb;if(c)for(b=[];c;c=c.fb)b.push(c);c=this.$b;var d=a.type||a;if("string"===typeof a)a=new F(a,c);else if(a instanceof F)a.target=a.target||c;else {var e=a;a=new F(d,c);z(a,e);}e=!0;if(b)for(var f=b.length-1;0<=f;f--){var g=a.b=b[f];e=xd(g,d,!0,a)&&e;}g=a.b=c;e=xd(g,d,!0,a)&&e;e=xd(g,d,!1,a)&&e;if(b)for(f=0;f<b.length;f++)g=a.b=b[f],e=xd(g,d,!1,a)&&e;return e};
    H.prototype.Da=function(){H.$a.Da.call(this);if(this.v){var a=this.v,c;for(c in a.a){for(var d=a.a[c],e=0;e<d.length;e++)cd(d[e]);delete a.a[c];a.b--;}}this.fb=null;};function md(a,b,c,d,e){a.v.add(String(b),c,!1,d,e);}function sd(a,b,c,d,e){a.v.add(String(b),c,!0,d,e);}
    function xd(a,b,c,d){b=a.v.a[String(b)];if(!b)return !0;b=b.concat();for(var e=!0,f=0;f<b.length;++f){var g=b[f];if(g&&!g.va&&g.capture==c){var h=g.listener,m=g.Ua||g.src;g.Oa&&fd(a.v,g);e=!1!==h.call(m,d)&&e;}}return e&&!d.defaultPrevented}function zd(a,b,c){if(na(a))c&&(a=q(a,c));else if(a&&"function"==typeof a.handleEvent)a=q(a.handleEvent,a);else throw Error("Invalid listener argument");return 2147483647<Number(b)?-1:l.setTimeout(a,b||0)}function Ad(a){var b=null;return (new C(function(c,d){b=zd(function(){c(void 0);},a);-1==b&&d(Error("Failed to schedule timer."));})).s(function(c){l.clearTimeout(b);throw c;})}function Bd(a){if(a.V&&"function"==typeof a.V)return a.V();if("string"===typeof a)return a.split("");if(ma(a)){for(var b=[],c=a.length,d=0;d<c;d++)b.push(a[d]);return b}b=[];c=0;for(d in a)b[c++]=a[d];return b}function Cd(a){if(a.Y&&"function"==typeof a.Y)return a.Y();if(!a.V||"function"!=typeof a.V){if(ma(a)||"string"===typeof a){var b=[];a=a.length;for(var c=0;c<a;c++)b.push(c);return b}b=[];c=0;for(var d in a)b[c++]=d;return b}}
    function Dd(a,b){if(a.forEach&&"function"==typeof a.forEach)a.forEach(b,void 0);else if(ma(a)||"string"===typeof a)w(a,b,void 0);else for(var c=Cd(a),d=Bd(a),e=d.length,f=0;f<e;f++)b.call(void 0,d[f],c&&c[f],a);}function Ed(a,b){this.b={};this.a=[];this.c=0;var c=arguments.length;if(1<c){if(c%2)throw Error("Uneven number of arguments");for(var d=0;d<c;d+=2)this.set(arguments[d],arguments[d+1]);}else if(a)if(a instanceof Ed)for(c=a.Y(),d=0;d<c.length;d++)this.set(c[d],a.get(c[d]));else for(d in a)this.set(d,a[d]);}k=Ed.prototype;k.V=function(){Fd(this);for(var a=[],b=0;b<this.a.length;b++)a.push(this.b[this.a[b]]);return a};k.Y=function(){Fd(this);return this.a.concat()};
    k.clear=function(){this.b={};this.c=this.a.length=0;};function Fd(a){if(a.c!=a.a.length){for(var b=0,c=0;b<a.a.length;){var d=a.a[b];Gd(a.b,d)&&(a.a[c++]=d);b++;}a.a.length=c;}if(a.c!=a.a.length){var e={};for(c=b=0;b<a.a.length;)d=a.a[b],Gd(e,d)||(a.a[c++]=d,e[d]=1),b++;a.a.length=c;}}k.get=function(a,b){return Gd(this.b,a)?this.b[a]:b};k.set=function(a,b){Gd(this.b,a)||(this.c++,this.a.push(a));this.b[a]=b;};
    k.forEach=function(a,b){for(var c=this.Y(),d=0;d<c.length;d++){var e=c[d],f=this.get(e);a.call(b,f,e,this);}};function Gd(a,b){return Object.prototype.hasOwnProperty.call(a,b)}var Hd=/^(?:([^:/?#.]+):)?(?:\/\/(?:([^/?#]*)@)?([^/#?]*?)(?::([0-9]+))?(?=[/\\#?]|$))?([^?#]+)?(?:\?([^#]*))?(?:#([\s\S]*))?$/;function Id(a,b){if(a){a=a.split("&");for(var c=0;c<a.length;c++){var d=a[c].indexOf("="),e=null;if(0<=d){var f=a[c].substring(0,d);e=a[c].substring(d+1);}else f=a[c];b(f,e?decodeURIComponent(e.replace(/\+/g," ")):"");}}}function Jd(a,b){this.a=this.l=this.f="";this.g=null;this.h=this.c="";this.i=!1;var c;a instanceof Jd?(this.i=void 0!==b?b:a.i,Kd(this,a.f),this.l=a.l,this.a=a.a,Ld(this,a.g),this.c=a.c,Md(this,Nd(a.b)),this.h=a.h):a&&(c=String(a).match(Hd))?(this.i=!!b,Kd(this,c[1]||"",!0),this.l=Od(c[2]||""),this.a=Od(c[3]||"",!0),Ld(this,c[4]),this.c=Od(c[5]||"",!0),Md(this,c[6]||"",!0),this.h=Od(c[7]||"")):(this.i=!!b,this.b=new Pd(null,this.i));}
    Jd.prototype.toString=function(){var a=[],b=this.f;b&&a.push(Qd(b,Rd,!0),":");var c=this.a;if(c||"file"==b)a.push("//"),(b=this.l)&&a.push(Qd(b,Rd,!0),"@"),a.push(encodeURIComponent(String(c)).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),c=this.g,null!=c&&a.push(":",String(c));if(c=this.c)this.a&&"/"!=c.charAt(0)&&a.push("/"),a.push(Qd(c,"/"==c.charAt(0)?Sd:Td,!0));(c=this.b.toString())&&a.push("?",c);(c=this.h)&&a.push("#",Qd(c,Ud));return a.join("")};
    Jd.prototype.resolve=function(a){var b=new Jd(this),c=!!a.f;c?Kd(b,a.f):c=!!a.l;c?b.l=a.l:c=!!a.a;c?b.a=a.a:c=null!=a.g;var d=a.c;if(c)Ld(b,a.g);else if(c=!!a.c){if("/"!=d.charAt(0))if(this.a&&!this.c)d="/"+d;else {var e=b.c.lastIndexOf("/");-1!=e&&(d=b.c.substr(0,e+1)+d);}e=d;if(".."==e||"."==e)d="";else if(x(e,"./")||x(e,"/.")){d=0==e.lastIndexOf("/",0);e=e.split("/");for(var f=[],g=0;g<e.length;){var h=e[g++];"."==h?d&&g==e.length&&f.push(""):".."==h?((1<f.length||1==f.length&&""!=f[0])&&f.pop(),
    d&&g==e.length&&f.push("")):(f.push(h),d=!0);}d=f.join("/");}else d=e;}c?b.c=d:c=""!==a.b.toString();c?Md(b,Nd(a.b)):c=!!a.h;c&&(b.h=a.h);return b};function Kd(a,b,c){a.f=c?Od(b,!0):b;a.f&&(a.f=a.f.replace(/:$/,""));}function Ld(a,b){if(b){b=Number(b);if(isNaN(b)||0>b)throw Error("Bad port number "+b);a.g=b;}else a.g=null;}function Md(a,b,c){b instanceof Pd?(a.b=b,Vd(a.b,a.i)):(c||(b=Qd(b,Wd)),a.b=new Pd(b,a.i));}function I(a,b,c){a.b.set(b,c);}function Xd(a,b){return a.b.get(b)}
    function J(a){return a instanceof Jd?new Jd(a):new Jd(a,void 0)}function Yd(a,b,c,d){var e=new Jd(null,void 0);a&&Kd(e,a);b&&(e.a=b);c&&Ld(e,c);d&&(e.c=d);return e}function Od(a,b){return a?b?decodeURI(a.replace(/%25/g,"%2525")):decodeURIComponent(a):""}function Qd(a,b,c){return "string"===typeof a?(a=encodeURI(a).replace(b,Zd),c&&(a=a.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),a):null}function Zd(a){a=a.charCodeAt(0);return "%"+(a>>4&15).toString(16)+(a&15).toString(16)}
    var Rd=/[#\/\?@]/g,Td=/[#\?:]/g,Sd=/[#\?]/g,Wd=/[#\?@]/g,Ud=/#/g;function Pd(a,b){this.b=this.a=null;this.c=a||null;this.f=!!b;}function $d(a){a.a||(a.a=new Ed,a.b=0,a.c&&Id(a.c,function(b,c){a.add(decodeURIComponent(b.replace(/\+/g," ")),c);}));}function ae(a){var b=Cd(a);if("undefined"==typeof b)throw Error("Keys are undefined");var c=new Pd(null,void 0);a=Bd(a);for(var d=0;d<b.length;d++){var e=b[d],f=a[d];Array.isArray(f)?be(c,e,f):c.add(e,f);}return c}k=Pd.prototype;
    k.add=function(a,b){$d(this);this.c=null;a=ce(this,a);var c=this.a.get(a);c||this.a.set(a,c=[]);c.push(b);this.b+=1;return this};function de(a,b){$d(a);b=ce(a,b);Gd(a.a.b,b)&&(a.c=null,a.b-=a.a.get(b).length,a=a.a,Gd(a.b,b)&&(delete a.b[b],a.c--,a.a.length>2*a.c&&Fd(a)));}k.clear=function(){this.a=this.c=null;this.b=0;};function ee(a,b){$d(a);b=ce(a,b);return Gd(a.a.b,b)}k.forEach=function(a,b){$d(this);this.a.forEach(function(c,d){w(c,function(e){a.call(b,e,d,this);},this);},this);};
    k.Y=function(){$d(this);for(var a=this.a.V(),b=this.a.Y(),c=[],d=0;d<b.length;d++)for(var e=a[d],f=0;f<e.length;f++)c.push(b[d]);return c};k.V=function(a){$d(this);var b=[];if("string"===typeof a)ee(this,a)&&(b=Wa(b,this.a.get(ce(this,a))));else {a=this.a.V();for(var c=0;c<a.length;c++)b=Wa(b,a[c]);}return b};k.set=function(a,b){$d(this);this.c=null;a=ce(this,a);ee(this,a)&&(this.b-=this.a.get(a).length);this.a.set(a,[b]);this.b+=1;return this};
    k.get=function(a,b){if(!a)return b;a=this.V(a);return 0<a.length?String(a[0]):b};function be(a,b,c){de(a,b);0<c.length&&(a.c=null,a.a.set(ce(a,b),Xa(c)),a.b+=c.length);}k.toString=function(){if(this.c)return this.c;if(!this.a)return "";for(var a=[],b=this.a.Y(),c=0;c<b.length;c++){var d=b[c],e=encodeURIComponent(String(d));d=this.V(d);for(var f=0;f<d.length;f++){var g=e;""!==d[f]&&(g+="="+encodeURIComponent(String(d[f])));a.push(g);}}return this.c=a.join("&")};
    function Nd(a){var b=new Pd;b.c=a.c;a.a&&(b.a=new Ed(a.a),b.b=a.b);return b}function ce(a,b){b=String(b);a.f&&(b=b.toLowerCase());return b}function Vd(a,b){b&&!a.f&&($d(a),a.c=null,a.a.forEach(function(c,d){var e=d.toLowerCase();d!=e&&(de(this,d),be(this,e,c));},a));a.f=b;}function fe(a){var b=[];ge(new he,a,b);return b.join("")}function he(){}
    function ge(a,b,c){if(null==b)c.push("null");else {if("object"==typeof b){if(Array.isArray(b)){var d=b;b=d.length;c.push("[");for(var e="",f=0;f<b;f++)c.push(e),ge(a,d[f],c),e=",";c.push("]");return}if(b instanceof String||b instanceof Number||b instanceof Boolean)b=b.valueOf();else {c.push("{");e="";for(d in b)Object.prototype.hasOwnProperty.call(b,d)&&(f=b[d],"function"!=typeof f&&(c.push(e),ie(d,c),c.push(":"),ge(a,f,c),e=","));c.push("}");return}}switch(typeof b){case "string":ie(b,c);break;case "number":c.push(isFinite(b)&&
    !isNaN(b)?String(b):"null");break;case "boolean":c.push(String(b));break;case "function":c.push("null");break;default:throw Error("Unknown type: "+typeof b);}}}var je={'"':'\\"',"\\":"\\\\","/":"\\/","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\x0B":"\\u000b"},ke=/\uffff/.test("\uffff")?/[\\"\x00-\x1f\x7f-\uffff]/g:/[\\"\x00-\x1f\x7f-\xff]/g;
    function ie(a,b){b.push('"',a.replace(ke,function(c){var d=je[c];d||(d="\\u"+(c.charCodeAt(0)|65536).toString(16).substr(1),je[c]=d);return d}),'"');}function le(){var a=K();return Tb&&!!dc&&11==dc||/Edge\/\d+/.test(a)}function me(){return l.window&&l.window.location.href||self&&self.location&&self.location.href||""}function ne(a,b){b=b||l.window;var c="about:blank";a&&(c=Db(Fb(a)));b.location.href=c;}function oe(a,b){var c=[],d;for(d in a)d in b?typeof a[d]!=typeof b[d]?c.push(d):"object"==typeof a[d]&&null!=a[d]&&null!=b[d]?0<oe(a[d],b[d]).length&&c.push(d):a[d]!==b[d]&&c.push(d):c.push(d);for(d in b)d in a||c.push(d);return c}
    function pe(){var a=K();a=qe(a)!=re?null:(a=a.match(/\sChrome\/(\d+)/i))&&2==a.length?parseInt(a[1],10):null;return a&&30>a?!1:!Tb||!dc||9<dc}function se(a){a=(a||K()).toLowerCase();return a.match(/android/)||a.match(/webos/)||a.match(/iphone|ipad|ipod/)||a.match(/blackberry/)||a.match(/windows phone/)||a.match(/iemobile/)?!0:!1}function te(a){a=a||l.window;try{a.close();}catch(b){}}
    function ue(a,b,c){var d=Math.floor(1E9*Math.random()).toString();b=b||500;c=c||600;var e=(window.screen.availHeight-c)/2,f=(window.screen.availWidth-b)/2;b={width:b,height:c,top:0<e?e:0,left:0<f?f:0,location:!0,resizable:!0,statusbar:!0,toolbar:!1};c=K().toLowerCase();d&&(b.target=d,x(c,"crios/")&&(b.target="_blank"));qe(K())==ve&&(a=a||"http://localhost",b.scrollbars=!0);c=a||"";(a=b)||(a={});d=window;b=c instanceof Ab?c:Fb("undefined"!=typeof c.href?c.href:String(c));c=a.target||c.target;e=[];
    for(g in a)switch(g){case "width":case "height":case "top":case "left":e.push(g+"="+a[g]);break;case "target":case "noopener":case "noreferrer":break;default:e.push(g+"="+(a[g]?1:0));}var g=e.join(",");if((y("iPhone")&&!y("iPod")&&!y("iPad")||y("iPad")||y("iPod"))&&d.navigator&&d.navigator.standalone&&c&&"_self"!=c)g=jc(document,"A"),nb(g,"HTMLAnchorElement"),b instanceof Ab||b instanceof Ab||(b="object"==typeof b&&b.sa?b.ra():String(b),Eb.test(b)||(b="about:invalid#zClosurez"),b=new Ab(Bb,b)),g.href=
    Db(b),g.setAttribute("target",c),a.noreferrer&&g.setAttribute("rel","noreferrer"),a=document.createEvent("MouseEvent"),a.initMouseEvent("click",!0,!0,d,1),g.dispatchEvent(a),g={};else if(a.noreferrer){if(g=d.open("",c,g),a=Db(b),g&&(Vb&&x(a,";")&&(a="'"+a.replace(/'/g,"%27")+"'"),g.opener=null,a=Jb('<meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0; url='+Ob(a)+'">'),d=g.document))d.write(Ib(a)),d.close();}else (g=d.open(Db(b),c,g))&&a.noopener&&(g.opener=null);if(g)try{g.focus();}catch(h){}return g}
    function we(a){return new C(function(b){function c(){Ad(2E3).then(function(){if(!a||a.closed)b();else return c()});}return c()})}var xe=/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,ye=/^[^@]+@[^@]+$/;function ze(){var a=null;return (new C(function(b){"complete"==l.document.readyState?b():(a=function(){b();},kd(window,"load",a));})).s(function(b){G(window,"load",a);throw b;})}
    function Ae(){return Be(void 0)?ze().then(function(){return new C(function(a,b){var c=l.document,d=setTimeout(function(){b(Error("Cordova framework is not ready."));},1E3);c.addEventListener("deviceready",function(){clearTimeout(d);a();},!1);})}):E(Error("Cordova must run in an Android or iOS file scheme."))}function Be(a){a=a||K();return !("file:"!==Ce()&&"ionic:"!==Ce()||!a.toLowerCase().match(/iphone|ipad|ipod|android/))}function De(){var a=l.window;try{return !(!a||a==a.top)}catch(b){return !1}}
    function Ee(){return "undefined"!==typeof l.WorkerGlobalScope&&"function"===typeof l.importScripts}function Fe(){return firebase.INTERNAL.hasOwnProperty("reactNative")?"ReactNative":firebase.INTERNAL.hasOwnProperty("node")?"Node":Ee()?"Worker":"Browser"}function Ge(){var a=Fe();return "ReactNative"===a||"Node"===a}function He(){for(var a=50,b=[];0<a;)b.push("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(62*Math.random()))),a--;return b.join("")}
    var ve="Firefox",re="Chrome";
    function qe(a){var b=a.toLowerCase();if(x(b,"opera/")||x(b,"opr/")||x(b,"opios/"))return "Opera";if(x(b,"iemobile"))return "IEMobile";if(x(b,"msie")||x(b,"trident/"))return "IE";if(x(b,"edge/"))return "Edge";if(x(b,"firefox/"))return ve;if(x(b,"silk/"))return "Silk";if(x(b,"blackberry"))return "Blackberry";if(x(b,"webos"))return "Webos";if(!x(b,"safari/")||x(b,"chrome/")||x(b,"crios/")||x(b,"android"))if(!x(b,"chrome/")&&!x(b,"crios/")||x(b,"edge/")){if(x(b,"android"))return "Android";if((a=a.match(/([a-zA-Z\d\.]+)\/[a-zA-Z\d\.]*$/))&&
    2==a.length)return a[1]}else return re;else return "Safari";return "Other"}var Ie={ld:"FirebaseCore-web",nd:"FirebaseUI-web"};function Je(a,b){b=b||[];var c=[],d={},e;for(e in Ie)d[Ie[e]]=!0;for(e=0;e<b.length;e++)"undefined"!==typeof d[b[e]]&&(delete d[b[e]],c.push(b[e]));c.sort();b=c;b.length||(b=["FirebaseCore-web"]);c=Fe();"Browser"===c?(d=K(),c=qe(d)):"Worker"===c&&(d=K(),c=qe(d)+"-"+c);return c+"/JsCore/"+a+"/"+b.join(",")}function K(){return l.navigator&&l.navigator.userAgent||""}
    function L(a,b){a=a.split(".");b=b||l;for(var c=0;c<a.length&&"object"==typeof b&&null!=b;c++)b=b[a[c]];c!=a.length&&(b=void 0);return b}function Ke(){try{var a=l.localStorage,b=Le();if(a)return a.setItem(b,"1"),a.removeItem(b),le()?!!l.indexedDB:!0}catch(c){return Ee()&&!!l.indexedDB}return !1}function Me(){return (Ne()||"chrome-extension:"===Ce()||Be())&&!Ge()&&Ke()&&!Ee()}function Ne(){return "http:"===Ce()||"https:"===Ce()}function Ce(){return l.location&&l.location.protocol||null}
    function Oe(a){a=a||K();return se(a)||qe(a)==ve?!1:!0}function Pe(a){return "undefined"===typeof a?null:fe(a)}function Qe(a){var b={},c;for(c in a)a.hasOwnProperty(c)&&null!==a[c]&&void 0!==a[c]&&(b[c]=a[c]);return b}function Re(a){if(null!==a)return JSON.parse(a)}function Le(a){return a?a:Math.floor(1E9*Math.random()).toString()}function Se(a){a=a||K();return "Safari"==qe(a)||a.toLowerCase().match(/iphone|ipad|ipod/)?!1:!0}
    function Te(){var a=l.___jsl;if(a&&a.H)for(var b in a.H)if(a.H[b].r=a.H[b].r||[],a.H[b].L=a.H[b].L||[],a.H[b].r=a.H[b].L.concat(),a.CP)for(var c=0;c<a.CP.length;c++)a.CP[c]=null;}function Ue(a,b){if(a>b)throw Error("Short delay should be less than long delay!");this.a=a;this.c=b;a=K();b=Fe();this.b=se(a)||"ReactNative"===b;}
    Ue.prototype.get=function(){var a=l.navigator;return (a&&"boolean"===typeof a.onLine&&(Ne()||"chrome-extension:"===Ce()||"undefined"!==typeof a.connection)?a.onLine:1)?this.b?this.c:this.a:Math.min(5E3,this.a)};function Ve(){var a=l.document;return a&&"undefined"!==typeof a.visibilityState?"visible"==a.visibilityState:!0}
    function We(){var a=l.document,b=null;return Ve()||!a?D():(new C(function(c){b=function(){Ve()&&(a.removeEventListener("visibilitychange",b,!1),c());};a.addEventListener("visibilitychange",b,!1);})).s(function(c){a.removeEventListener("visibilitychange",b,!1);throw c;})}function Xe(a){"undefined"!==typeof console&&"function"===typeof console.warn&&console.warn(a);}
    function Ye(a){try{var b=new Date(parseInt(a,10));if(!isNaN(b.getTime())&&!/[^0-9]/.test(a))return b.toUTCString()}catch(c){}return null}function Ze(){return !(!L("fireauth.oauthhelper",l)&&!L("fireauth.iframe",l))}function $e(){var a=l.navigator;return a&&a.serviceWorker&&a.serviceWorker.controller||null}function af(){var a=l.navigator;return a&&a.serviceWorker?D().then(function(){return a.serviceWorker.ready}).then(function(b){return b.active||null}).s(function(){return null}):D(null)}var bf={};function cf(a){bf[a]||(bf[a]=!0,Xe(a));}var df;try{var ef={};Object.defineProperty(ef,"abcd",{configurable:!0,enumerable:!0,value:1});Object.defineProperty(ef,"abcd",{configurable:!0,enumerable:!0,value:2});df=2==ef.abcd;}catch(a){df=!1;}function M(a,b,c){df?Object.defineProperty(a,b,{configurable:!0,enumerable:!0,value:c}):a[b]=c;}function N(a,b){if(b)for(var c in b)b.hasOwnProperty(c)&&M(a,c,b[c]);}function ff(a){var b={};N(b,a);return b}function gf(a){var b={},c;for(c in a)a.hasOwnProperty(c)&&(b[c]=a[c]);return b}
    function hf(a,b){if(!b||!b.length)return !0;if(!a)return !1;for(var c=0;c<b.length;c++){var d=a[b[c]];if(void 0===d||null===d||""===d)return !1}return !0}function jf(a){var b=a;if("object"==typeof a&&null!=a){b="length"in a?[]:{};for(var c in a)M(b,c,jf(a[c]));}return b}function kf(a){var b=a&&(a[lf]?"phone":null);if(b&&a&&a[mf]){M(this,"uid",a[mf]);M(this,"displayName",a[nf]||null);var c=null;a[of]&&(c=(new Date(a[of])).toUTCString());M(this,"enrollmentTime",c);M(this,"factorId",b);}else throw new t("internal-error","Internal assert: invalid MultiFactorInfo object");}kf.prototype.w=function(){return {uid:this.uid,displayName:this.displayName,factorId:this.factorId,enrollmentTime:this.enrollmentTime}};function pf(a){try{var b=new qf(a);}catch(c){b=null;}return b}
    var nf="displayName",of="enrolledAt",mf="mfaEnrollmentId",lf="phoneInfo";function qf(a){kf.call(this,a);M(this,"phoneNumber",a[lf]);}r(qf,kf);qf.prototype.w=function(){var a=qf.$a.w.call(this);a.phoneNumber=this.phoneNumber;return a};function rf(a){var b={},c=a[sf],d=a[tf],e=a[uf];a=pf(a[vf]);if(!e||e!=wf&&e!=xf&&!c||e==xf&&!d||e==yf&&!a)throw Error("Invalid checkActionCode response!");e==xf?(b[zf]=c||null,b[Af]=c||null,b[Bf]=d):(b[zf]=d||null,b[Af]=d||null,b[Bf]=c||null);b[Cf]=a||null;M(this,Df,e);M(this,Ef,jf(b));}
    var yf="REVERT_SECOND_FACTOR_ADDITION",wf="EMAIL_SIGNIN",xf="VERIFY_AND_CHANGE_EMAIL",sf="email",vf="mfaInfo",tf="newEmail",uf="requestType",Bf="email",zf="fromEmail",Cf="multiFactorInfo",Af="previousEmail",Ef="data",Df="operation";function Ff(a){a=J(a);var b=Xd(a,Gf)||null,c=Xd(a,Hf)||null,d=Xd(a,If)||null;d=d?Jf[d]||null:null;if(!b||!c||!d)throw new t("argument-error",Gf+", "+Hf+"and "+If+" are required in a valid action code URL.");N(this,{apiKey:b,operation:d,code:c,continueUrl:Xd(a,Kf)||null,languageCode:Xd(a,Lf)||null,tenantId:Xd(a,Mf)||null});}
    var Gf="apiKey",Hf="oobCode",Kf="continueUrl",Lf="languageCode",If="mode",Mf="tenantId",Jf={recoverEmail:"RECOVER_EMAIL",resetPassword:"PASSWORD_RESET",revertSecondFactorAddition:yf,signIn:wf,verifyAndChangeEmail:xf,verifyEmail:"VERIFY_EMAIL"};function Nf(a){try{return new Ff(a)}catch(b){return null}}function Of(a){var b=a[Pf];if("undefined"===typeof b)throw new t("missing-continue-uri");if("string"!==typeof b||"string"===typeof b&&!b.length)throw new t("invalid-continue-uri");this.h=b;this.b=this.a=null;this.g=!1;var c=a[Qf];if(c&&"object"===typeof c){b=c[Rf];var d=c[Sf];c=c[Tf];if("string"===typeof b&&b.length){this.a=b;if("undefined"!==typeof d&&"boolean"!==typeof d)throw new t("argument-error",Sf+" property must be a boolean when specified.");this.g=!!d;if("undefined"!==typeof c&&("string"!==
    typeof c||"string"===typeof c&&!c.length))throw new t("argument-error",Tf+" property must be a non empty string when specified.");this.b=c||null;}else {if("undefined"!==typeof b)throw new t("argument-error",Rf+" property must be a non empty string when specified.");if("undefined"!==typeof d||"undefined"!==typeof c)throw new t("missing-android-pkg-name");}}else if("undefined"!==typeof c)throw new t("argument-error",Qf+" property must be a non null object when specified.");this.f=null;if((b=a[Uf])&&"object"===
    typeof b)if(b=b[Vf],"string"===typeof b&&b.length)this.f=b;else {if("undefined"!==typeof b)throw new t("argument-error",Vf+" property must be a non empty string when specified.");}else if("undefined"!==typeof b)throw new t("argument-error",Uf+" property must be a non null object when specified.");b=a[Wf];if("undefined"!==typeof b&&"boolean"!==typeof b)throw new t("argument-error",Wf+" property must be a boolean when specified.");this.c=!!b;a=a[Xf];if("undefined"!==typeof a&&("string"!==typeof a||"string"===
    typeof a&&!a.length))throw new t("argument-error",Xf+" property must be a non empty string when specified.");this.i=a||null;}var Qf="android",Xf="dynamicLinkDomain",Wf="handleCodeInApp",Uf="iOS",Pf="url",Sf="installApp",Tf="minimumVersion",Rf="packageName",Vf="bundleId";
    function Yf(a){var b={};b.continueUrl=a.h;b.canHandleCodeInApp=a.c;if(b.androidPackageName=a.a)b.androidMinimumVersion=a.b,b.androidInstallApp=a.g;b.iOSBundleId=a.f;b.dynamicLinkDomain=a.i;for(var c in b)null===b[c]&&delete b[c];return b}function Zf(a){return Pa(a,function(b){b=b.toString(16);return 1<b.length?b:"0"+b}).join("")}var $f=null;function ag(a){var b="";bg(a,function(c){b+=String.fromCharCode(c);});return b}function bg(a,b){function c(m){for(;d<a.length;){var p=a.charAt(d++),v=$f[p];if(null!=v)return v;if(!/^[\s\xa0]*$/.test(p))throw Error("Unknown base64 encoding at char: "+p);}return m}cg();for(var d=0;;){var e=c(-1),f=c(0),g=c(64),h=c(64);if(64===h&&-1===e)break;b(e<<2|f>>4);64!=g&&(b(f<<4&240|g>>2),64!=h&&b(g<<6&192|h));}}
    function cg(){if(!$f){$f={};for(var a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(""),b=["+/=","+/","-_=","-_.","-_"],c=0;5>c;c++)for(var d=a.concat(b[c].split("")),e=0;e<d.length;e++){var f=d[e];void 0===$f[f]&&($f[f]=e);}}}function dg(a){var b=eg(a);if(!(b&&b.sub&&b.iss&&b.aud&&b.exp))throw Error("Invalid JWT");this.g=a;this.c=b.exp;this.h=b.sub;this.a=b.provider_id||b.firebase&&b.firebase.sign_in_provider||null;this.f=b.firebase&&b.firebase.tenant||null;this.b=!!b.is_anonymous||"anonymous"==this.a;}dg.prototype.S=function(){return this.f};dg.prototype.i=function(){return this.b};dg.prototype.toString=function(){return this.g};function fg(a){try{return new dg(a)}catch(b){return null}}
    function eg(a){if(!a)return null;a=a.split(".");if(3!=a.length)return null;a=a[1];for(var b=(4-a.length%4)%4,c=0;c<b;c++)a+=".";try{return JSON.parse(ag(a))}catch(d){}return null}var gg="oauth_consumer_key oauth_nonce oauth_signature oauth_signature_method oauth_timestamp oauth_token oauth_version".split(" "),hg=["client_id","response_type","scope","redirect_uri","state"],ig={md:{Ja:"locale",ua:700,ta:600,fa:"facebook.com",Wa:hg},od:{Ja:null,ua:500,ta:750,fa:"github.com",Wa:hg},pd:{Ja:"hl",ua:515,ta:680,fa:"google.com",Wa:hg},vd:{Ja:"lang",ua:485,ta:705,fa:"twitter.com",Wa:gg},jd:{Ja:"locale",ua:640,ta:600,fa:"apple.com",Wa:[]}};
    function jg(a){for(var b in ig)if(ig[b].fa==a)return ig[b];return null}function kg(a){var b={};b["facebook.com"]=lg;b["google.com"]=mg;b["github.com"]=ng;b["twitter.com"]=og;var c=a&&a[pg];try{if(c)return b[c]?new b[c](a):new qg(a);if("undefined"!==typeof a[rg])return new sg(a)}catch(d){}return null}var rg="idToken",pg="providerId";
    function sg(a){var b=a[pg];if(!b&&a[rg]){var c=fg(a[rg]);c&&c.a&&(b=c.a);}if(!b)throw Error("Invalid additional user info!");if("anonymous"==b||"custom"==b)b=null;c=!1;"undefined"!==typeof a.isNewUser?c=!!a.isNewUser:"identitytoolkit#SignupNewUserResponse"===a.kind&&(c=!0);M(this,"providerId",b);M(this,"isNewUser",c);}function qg(a){sg.call(this,a);a=Re(a.rawUserInfo||"{}");M(this,"profile",jf(a||{}));}r(qg,sg);
    function lg(a){qg.call(this,a);if("facebook.com"!=this.providerId)throw Error("Invalid provider ID!");}r(lg,qg);function ng(a){qg.call(this,a);if("github.com"!=this.providerId)throw Error("Invalid provider ID!");M(this,"username",this.profile&&this.profile.login||null);}r(ng,qg);function mg(a){qg.call(this,a);if("google.com"!=this.providerId)throw Error("Invalid provider ID!");}r(mg,qg);
    function og(a){qg.call(this,a);if("twitter.com"!=this.providerId)throw Error("Invalid provider ID!");M(this,"username",a.screenName||null);}r(og,qg);function tg(a){var b=J(a),c=Xd(b,"link"),d=Xd(J(c),"link");b=Xd(b,"deep_link_id");return Xd(J(b),"link")||b||d||c||a}function ug(a,b){if(!a&&!b)throw new t("internal-error","Internal assert: no raw session string available");if(a&&b)throw new t("internal-error","Internal assert: unable to determine the session type");this.a=a||null;this.b=b||null;this.type=this.a?vg:wg;}var vg="enroll",wg="signin";ug.prototype.Ha=function(){return this.a?D(this.a):D(this.b)};ug.prototype.w=function(){return this.type==vg?{multiFactorSession:{idToken:this.a}}:{multiFactorSession:{pendingCredential:this.b}}};function xg(){}xg.prototype.ja=function(){};xg.prototype.b=function(){};xg.prototype.c=function(){};xg.prototype.w=function(){};function yg(a,b){return a.then(function(c){if(c[zg]){var d=fg(c[zg]);if(!d||b!=d.h)throw new t("user-mismatch");return c}throw new t("user-mismatch");}).s(function(c){throw c&&c.code&&c.code==va+"user-not-found"?new t("user-mismatch"):c;})}
    function Ag(a,b){if(b)this.a=b;else throw new t("internal-error","failed to construct a credential");M(this,"providerId",a);M(this,"signInMethod",a);}Ag.prototype.ja=function(a){return Bg(a,Cg(this))};Ag.prototype.b=function(a,b){var c=Cg(this);c.idToken=b;return Dg(a,c)};Ag.prototype.c=function(a,b){return yg(Eg(a,Cg(this)),b)};function Cg(a){return {pendingToken:a.a,requestUri:"http://localhost"}}Ag.prototype.w=function(){return {providerId:this.providerId,signInMethod:this.signInMethod,pendingToken:this.a}};
    function Fg(a){if(a&&a.providerId&&a.signInMethod&&0==a.providerId.indexOf("saml.")&&a.pendingToken)try{return new Ag(a.providerId,a.pendingToken)}catch(b){}return null}
    function Gg(a,b,c){this.a=null;if(b.idToken||b.accessToken)b.idToken&&M(this,"idToken",b.idToken),b.accessToken&&M(this,"accessToken",b.accessToken),b.nonce&&!b.pendingToken&&M(this,"nonce",b.nonce),b.pendingToken&&(this.a=b.pendingToken);else if(b.oauthToken&&b.oauthTokenSecret)M(this,"accessToken",b.oauthToken),M(this,"secret",b.oauthTokenSecret);else throw new t("internal-error","failed to construct a credential");M(this,"providerId",a);M(this,"signInMethod",c);}
    Gg.prototype.ja=function(a){return Bg(a,Hg(this))};Gg.prototype.b=function(a,b){var c=Hg(this);c.idToken=b;return Dg(a,c)};Gg.prototype.c=function(a,b){var c=Hg(this);return yg(Eg(a,c),b)};
    function Hg(a){var b={};a.idToken&&(b.id_token=a.idToken);a.accessToken&&(b.access_token=a.accessToken);a.secret&&(b.oauth_token_secret=a.secret);b.providerId=a.providerId;a.nonce&&!a.a&&(b.nonce=a.nonce);b={postBody:ae(b).toString(),requestUri:"http://localhost"};a.a&&(delete b.postBody,b.pendingToken=a.a);return b}
    Gg.prototype.w=function(){var a={providerId:this.providerId,signInMethod:this.signInMethod};this.idToken&&(a.oauthIdToken=this.idToken);this.accessToken&&(a.oauthAccessToken=this.accessToken);this.secret&&(a.oauthTokenSecret=this.secret);this.nonce&&(a.nonce=this.nonce);this.a&&(a.pendingToken=this.a);return a};
    function Ig(a){if(a&&a.providerId&&a.signInMethod){var b={idToken:a.oauthIdToken,accessToken:a.oauthTokenSecret?null:a.oauthAccessToken,oauthTokenSecret:a.oauthTokenSecret,oauthToken:a.oauthTokenSecret&&a.oauthAccessToken,nonce:a.nonce,pendingToken:a.pendingToken};try{return new Gg(a.providerId,b,a.signInMethod)}catch(c){}}return null}function Jg(a,b){this.Pc=b||[];N(this,{providerId:a,isOAuthProvider:!0});this.Hb={};this.ob=(jg(a)||{}).Ja||null;this.nb=null;}
    Jg.prototype.Ka=function(a){this.Hb=lb(a);return this};function Kg(a){if("string"!==typeof a||0!=a.indexOf("saml."))throw new t("argument-error",'SAML provider IDs must be prefixed with "saml."');Jg.call(this,a,[]);}r(Kg,Jg);function Lg(a){Jg.call(this,a,hg);this.a=[];}r(Lg,Jg);Lg.prototype.Ca=function(a){Ta(this.a,a)||this.a.push(a);return this};Lg.prototype.Pb=function(){return Xa(this.a)};
    Lg.prototype.credential=function(a,b){var c;n(a)?c={idToken:a.idToken||null,accessToken:a.accessToken||null,nonce:a.rawNonce||null}:c={idToken:a||null,accessToken:b||null};if(!c.idToken&&!c.accessToken)throw new t("argument-error","credential failed: must provide the ID token and/or the access token.");return new Gg(this.providerId,c,this.providerId)};function Mg(){Lg.call(this,"facebook.com");}r(Mg,Lg);M(Mg,"PROVIDER_ID","facebook.com");M(Mg,"FACEBOOK_SIGN_IN_METHOD","facebook.com");
    function Ng(a){if(!a)throw new t("argument-error","credential failed: expected 1 argument (the OAuth access token).");var b=a;n(a)&&(b=a.accessToken);return (new Mg).credential({accessToken:b})}function Og(){Lg.call(this,"github.com");}r(Og,Lg);M(Og,"PROVIDER_ID","github.com");M(Og,"GITHUB_SIGN_IN_METHOD","github.com");
    function Pg(a){if(!a)throw new t("argument-error","credential failed: expected 1 argument (the OAuth access token).");var b=a;n(a)&&(b=a.accessToken);return (new Og).credential({accessToken:b})}function Qg(){Lg.call(this,"google.com");this.Ca("profile");}r(Qg,Lg);M(Qg,"PROVIDER_ID","google.com");M(Qg,"GOOGLE_SIGN_IN_METHOD","google.com");function Rg(a,b){var c=a;n(a)&&(c=a.idToken,b=a.accessToken);return (new Qg).credential({idToken:c,accessToken:b})}function Sg(){Jg.call(this,"twitter.com",gg);}
    r(Sg,Jg);M(Sg,"PROVIDER_ID","twitter.com");M(Sg,"TWITTER_SIGN_IN_METHOD","twitter.com");function Tg(a,b){var c=a;n(c)||(c={oauthToken:a,oauthTokenSecret:b});if(!c.oauthToken||!c.oauthTokenSecret)throw new t("argument-error","credential failed: expected 2 arguments (the OAuth access token and secret).");return new Gg("twitter.com",c,"twitter.com")}
    function Ug(a,b,c){this.a=a;this.f=b;M(this,"providerId","password");M(this,"signInMethod",c===Vg.EMAIL_LINK_SIGN_IN_METHOD?Vg.EMAIL_LINK_SIGN_IN_METHOD:Vg.EMAIL_PASSWORD_SIGN_IN_METHOD);}Ug.prototype.ja=function(a){return this.signInMethod==Vg.EMAIL_LINK_SIGN_IN_METHOD?O(a,Wg,{email:this.a,oobCode:this.f}):O(a,Xg,{email:this.a,password:this.f})};
    Ug.prototype.b=function(a,b){return this.signInMethod==Vg.EMAIL_LINK_SIGN_IN_METHOD?O(a,Yg,{idToken:b,email:this.a,oobCode:this.f}):O(a,Zg,{idToken:b,email:this.a,password:this.f})};Ug.prototype.c=function(a,b){return yg(this.ja(a),b)};Ug.prototype.w=function(){return {email:this.a,password:this.f,signInMethod:this.signInMethod}};function $g(a){return a&&a.email&&a.password?new Ug(a.email,a.password,a.signInMethod):null}function Vg(){N(this,{providerId:"password",isOAuthProvider:!1});}
    function ah(a,b){b=bh(b);if(!b)throw new t("argument-error","Invalid email link!");return new Ug(a,b.code,Vg.EMAIL_LINK_SIGN_IN_METHOD)}function bh(a){a=tg(a);return (a=Nf(a))&&a.operation===wf?a:null}N(Vg,{PROVIDER_ID:"password"});N(Vg,{EMAIL_LINK_SIGN_IN_METHOD:"emailLink"});N(Vg,{EMAIL_PASSWORD_SIGN_IN_METHOD:"password"});function ch(a){if(!(a.cb&&a.bb||a.La&&a.ea))throw new t("internal-error");this.a=a;M(this,"providerId","phone");this.fa="phone";M(this,"signInMethod","phone");}
    ch.prototype.ja=function(a){return a.eb(dh(this))};ch.prototype.b=function(a,b){var c=dh(this);c.idToken=b;return O(a,eh,c)};ch.prototype.c=function(a,b){var c=dh(this);c.operation="REAUTH";a=O(a,fh,c);return yg(a,b)};ch.prototype.w=function(){var a={providerId:"phone"};this.a.cb&&(a.verificationId=this.a.cb);this.a.bb&&(a.verificationCode=this.a.bb);this.a.La&&(a.temporaryProof=this.a.La);this.a.ea&&(a.phoneNumber=this.a.ea);return a};
    function gh(a){if(a&&"phone"===a.providerId&&(a.verificationId&&a.verificationCode||a.temporaryProof&&a.phoneNumber)){var b={};w(["verificationId","verificationCode","temporaryProof","phoneNumber"],function(c){a[c]&&(b[c]=a[c]);});return new ch(b)}return null}function dh(a){return a.a.La&&a.a.ea?{temporaryProof:a.a.La,phoneNumber:a.a.ea}:{sessionInfo:a.a.cb,code:a.a.bb}}
    function hh(a){try{this.a=a||firebase.auth();}catch(b){throw new t("argument-error","Either an instance of firebase.auth.Auth must be passed as an argument to the firebase.auth.PhoneAuthProvider constructor, or the default firebase App instance must be initialized via firebase.initializeApp().");}N(this,{providerId:"phone",isOAuthProvider:!1});}
    hh.prototype.eb=function(a,b){var c=this.a.a;return D(b.verify()).then(function(d){if("string"!==typeof d)throw new t("argument-error","An implementation of firebase.auth.ApplicationVerifier.prototype.verify() must return a firebase.Promise that resolves with a string.");switch(b.type){case "recaptcha":var e=n(a)?a.session:null,f=n(a)?a.phoneNumber:a,g;e&&e.type==vg?g=e.Ha().then(function(h){return ih(c,{idToken:h,phoneEnrollmentInfo:{phoneNumber:f,recaptchaToken:d}})}):e&&e.type==wg?g=e.Ha().then(function(h){return jh(c,
    {mfaPendingCredential:h,mfaEnrollmentId:a.multiFactorHint&&a.multiFactorHint.uid||a.multiFactorUid,phoneSignInInfo:{recaptchaToken:d}})}):g=kh(c,{phoneNumber:f,recaptchaToken:d});return g.then(function(h){"function"===typeof b.reset&&b.reset();return h},function(h){"function"===typeof b.reset&&b.reset();throw h;});default:throw new t("argument-error",'Only firebase.auth.ApplicationVerifiers with type="recaptcha" are currently supported.');}})};
    function lh(a,b){if(!a)throw new t("missing-verification-id");if(!b)throw new t("missing-verification-code");return new ch({cb:a,bb:b})}N(hh,{PROVIDER_ID:"phone"});N(hh,{PHONE_SIGN_IN_METHOD:"phone"});
    function mh(a){if(a.temporaryProof&&a.phoneNumber)return new ch({La:a.temporaryProof,ea:a.phoneNumber});var b=a&&a.providerId;if(!b||"password"===b)return null;var c=a&&a.oauthAccessToken,d=a&&a.oauthTokenSecret,e=a&&a.nonce,f=a&&a.oauthIdToken,g=a&&a.pendingToken;try{switch(b){case "google.com":return Rg(f,c);case "facebook.com":return Ng(c);case "github.com":return Pg(c);case "twitter.com":return Tg(c,d);default:return c||d||f||g?g?0==b.indexOf("saml.")?new Ag(b,g):new Gg(b,{pendingToken:g,idToken:a.oauthIdToken,
    accessToken:a.oauthAccessToken},b):(new Lg(b)).credential({idToken:f,accessToken:c,rawNonce:e}):null}}catch(h){return null}}function nh(a){if(!a.isOAuthProvider)throw new t("invalid-oauth-provider");}function oh(a,b,c,d,e,f,g){this.c=a;this.b=b||null;this.g=c||null;this.f=d||null;this.i=f||null;this.h=g||null;this.a=e||null;if(this.g||this.a){if(this.g&&this.a)throw new t("invalid-auth-event");if(this.g&&!this.f)throw new t("invalid-auth-event");}else throw new t("invalid-auth-event");}oh.prototype.getUid=function(){var a=[];a.push(this.c);this.b&&a.push(this.b);this.f&&a.push(this.f);this.h&&a.push(this.h);return a.join("-")};oh.prototype.S=function(){return this.h};
    oh.prototype.w=function(){return {type:this.c,eventId:this.b,urlResponse:this.g,sessionId:this.f,postBody:this.i,tenantId:this.h,error:this.a&&this.a.w()}};function ph(a){a=a||{};return a.type?new oh(a.type,a.eventId,a.urlResponse,a.sessionId,a.error&&ya(a.error),a.postBody,a.tenantId):null}function qh(){this.b=null;this.a=[];}var rh=null;function sh(a){var b=rh;b.a.push(a);b.b||(b.b=function(c){for(var d=0;d<b.a.length;d++)b.a[d](c);},a=L("universalLinks.subscribe",l),"function"===typeof a&&a(null,b.b));}function th(a){var b="unauthorized-domain",c=void 0,d=J(a);a=d.a;d=d.f;"chrome-extension"==d?c=Nb("This chrome extension ID (chrome-extension://%s) is not authorized to run this operation. Add it to the OAuth redirect domains list in the Firebase console -> Auth section -> Sign in method tab.",a):"http"==d||"https"==d?c=Nb("This domain (%s) is not authorized to run this operation. Add it to the OAuth redirect domains list in the Firebase console -> Auth section -> Sign in method tab.",a):b="operation-not-supported-in-this-environment";
    t.call(this,b,c);}r(th,t);function uh(a,b,c){t.call(this,a,c);a=b||{};a.Ib&&M(this,"email",a.Ib);a.ea&&M(this,"phoneNumber",a.ea);a.credential&&M(this,"credential",a.credential);a.Yb&&M(this,"tenantId",a.Yb);}r(uh,t);uh.prototype.w=function(){var a={code:this.code,message:this.message};this.email&&(a.email=this.email);this.phoneNumber&&(a.phoneNumber=this.phoneNumber);this.tenantId&&(a.tenantId=this.tenantId);var b=this.credential&&this.credential.w();b&&z(a,b);return a};uh.prototype.toJSON=function(){return this.w()};
    function vh(a){if(a.code){var b=a.code||"";0==b.indexOf(va)&&(b=b.substring(va.length));var c={credential:mh(a),Yb:a.tenantId};if(a.email)c.Ib=a.email;else if(a.phoneNumber)c.ea=a.phoneNumber;else if(!c.credential)return new t(b,a.message||void 0);return new uh(b,c,a.message)}return null}function wh(){}wh.prototype.c=null;function xh(a){return a.c||(a.c=a.b())}var yh;function zh(){}r(zh,wh);zh.prototype.a=function(){var a=Ah(this);return a?new ActiveXObject(a):new XMLHttpRequest};zh.prototype.b=function(){var a={};Ah(this)&&(a[0]=!0,a[1]=!0);return a};
    function Ah(a){if(!a.f&&"undefined"==typeof XMLHttpRequest&&"undefined"!=typeof ActiveXObject){for(var b=["MSXML2.XMLHTTP.6.0","MSXML2.XMLHTTP.3.0","MSXML2.XMLHTTP","Microsoft.XMLHTTP"],c=0;c<b.length;c++){var d=b[c];try{return new ActiveXObject(d),a.f=d}catch(e){}}throw Error("Could not create ActiveXObject. ActiveX might be disabled, or MSXML might not be installed");}return a.f}yh=new zh;function Bh(){}r(Bh,wh);Bh.prototype.a=function(){var a=new XMLHttpRequest;if("withCredentials"in a)return a;if("undefined"!=typeof XDomainRequest)return new Ch;throw Error("Unsupported browser");};Bh.prototype.b=function(){return {}};
    function Ch(){this.a=new XDomainRequest;this.readyState=0;this.onreadystatechange=null;this.responseType=this.responseText=this.response="";this.status=-1;this.statusText="";this.a.onload=q(this.pc,this);this.a.onerror=q(this.Rb,this);this.a.onprogress=q(this.qc,this);this.a.ontimeout=q(this.uc,this);}k=Ch.prototype;k.open=function(a,b,c){if(null!=c&&!c)throw Error("Only async requests are supported.");this.a.open(a,b);};
    k.send=function(a){if(a)if("string"==typeof a)this.a.send(a);else throw Error("Only string data is supported");else this.a.send();};k.abort=function(){this.a.abort();};k.setRequestHeader=function(){};k.getResponseHeader=function(a){return "content-type"==a.toLowerCase()?this.a.contentType:""};k.pc=function(){this.status=200;this.response=this.responseText=this.a.responseText;Dh(this,4);};k.Rb=function(){this.status=500;this.response=this.responseText="";Dh(this,4);};k.uc=function(){this.Rb();};
    k.qc=function(){this.status=200;Dh(this,1);};function Dh(a,b){a.readyState=b;if(a.onreadystatechange)a.onreadystatechange();}k.getAllResponseHeaders=function(){return "content-type: "+this.a.contentType};function Eh(a,b,c){this.reset(a,b,c,void 0,void 0);}Eh.prototype.a=null;Eh.prototype.reset=function(a,b,c,d,e){delete this.a;};function Gh(a){this.f=a;this.b=this.c=this.a=null;}function Hh(a,b){this.name=a;this.value=b;}Hh.prototype.toString=function(){return this.name};var Ih=new Hh("SEVERE",1E3),Jh=new Hh("WARNING",900),Kh=new Hh("CONFIG",700),Lh=new Hh("FINE",500);function Mh(a){if(a.c)return a.c;if(a.a)return Mh(a.a);Ea("Root logger has no level set.");return null}Gh.prototype.log=function(a,b,c){if(a.value>=Mh(this).value)for(na(b)&&(b=b()),a=new Eh(a,String(b),this.f),c&&(a.a=c),c=this;c;)c=c.a;};var Nh={},Oh=null;
    function Ph(a){Oh||(Oh=new Gh(""),Nh[""]=Oh,Oh.c=Kh);var b;if(!(b=Nh[a])){b=new Gh(a);var c=a.lastIndexOf("."),d=a.substr(c+1);c=Ph(a.substr(0,c));c.b||(c.b={});c.b[d]=b;b.a=c;Nh[a]=b;}return b}function Qh(a,b){a&&a.log(Lh,b,void 0);}function Rh(a){this.f=a;}r(Rh,wh);Rh.prototype.a=function(){return new Sh(this.f)};Rh.prototype.b=function(a){return function(){return a}}({});function Sh(a){H.call(this);this.o=a;this.readyState=Th;this.status=0;this.responseType=this.responseText=this.response=this.statusText="";this.onreadystatechange=null;this.i=new Headers;this.b=null;this.m="GET";this.g="";this.a=!1;this.h=Ph("goog.net.FetchXmlHttp");this.l=this.c=this.f=null;}r(Sh,H);var Th=0;k=Sh.prototype;
    k.open=function(a,b){if(this.readyState!=Th)throw this.abort(),Error("Error reopening a connection");this.m=a;this.g=b;this.readyState=1;Uh(this);};k.send=function(a){if(1!=this.readyState)throw this.abort(),Error("need to call open() first. ");this.a=!0;var b={headers:this.i,method:this.m,credentials:void 0,cache:void 0};a&&(b.body=a);this.o.fetch(new Request(this.g,b)).then(this.tc.bind(this),this.Ta.bind(this));};
    k.abort=function(){this.response=this.responseText="";this.i=new Headers;this.status=0;this.c&&this.c.cancel("Request was aborted.");1<=this.readyState&&this.a&&4!=this.readyState&&(this.a=!1,Vh(this,!1));this.readyState=Th;};
    k.tc=function(a){this.a&&(this.f=a,this.b||(this.b=a.headers,this.readyState=2,Uh(this)),this.a&&(this.readyState=3,Uh(this),this.a&&("arraybuffer"===this.responseType?a.arrayBuffer().then(this.rc.bind(this),this.Ta.bind(this)):"undefined"!==typeof l.ReadableStream&&"body"in a?(this.response=this.responseText="",this.c=a.body.getReader(),this.l=new TextDecoder,Wh(this)):a.text().then(this.sc.bind(this),this.Ta.bind(this)))));};function Wh(a){a.c.read().then(a.oc.bind(a)).catch(a.Ta.bind(a));}
    k.oc=function(a){if(this.a){var b=this.l.decode(a.value?a.value:new Uint8Array(0),{stream:!a.done});b&&(this.response=this.responseText+=b);a.done?Vh(this,!0):Uh(this);3==this.readyState&&Wh(this);}};k.sc=function(a){this.a&&(this.response=this.responseText=a,Vh(this,!0));};k.rc=function(a){this.a&&(this.response=a,Vh(this,!0));};k.Ta=function(a){var b=this.h;b&&b.log(Jh,"Failed to fetch url "+this.g,a instanceof Error?a:Error(a));this.a&&Vh(this,!0);};
    function Vh(a,b){b&&a.f&&(a.status=a.f.status,a.statusText=a.f.statusText);a.readyState=4;a.f=null;a.c=null;a.l=null;Uh(a);}k.setRequestHeader=function(a,b){this.i.append(a,b);};k.getResponseHeader=function(a){return this.b?this.b.get(a.toLowerCase())||"":((a=this.h)&&a.log(Jh,"Attempting to get response header but no headers have been received for url: "+this.g,void 0),"")};
    k.getAllResponseHeaders=function(){if(!this.b){var a=this.h;a&&a.log(Jh,"Attempting to get all response headers but no headers have been received for url: "+this.g,void 0);return ""}a=[];for(var b=this.b.entries(),c=b.next();!c.done;)c=c.value,a.push(c[0]+": "+c[1]),c=b.next();return a.join("\r\n")};function Uh(a){a.onreadystatechange&&a.onreadystatechange.call(a);}function Xh(a){H.call(this);this.headers=new Ed;this.O=a||null;this.c=!1;this.A=this.a=null;this.h=this.P=this.l="";this.f=this.N=this.i=this.G=!1;this.g=0;this.o=null;this.m=Yh;this.u=this.R=!1;}r(Xh,H);var Yh="";Xh.prototype.b=Ph("goog.net.XhrIo");var Zh=/^https?$/i,$h=["POST","PUT"];
    function ai(a,b,c,d,e){if(a.a)throw Error("[goog.net.XhrIo] Object is active with another request="+a.l+"; newUri="+b);c=c?c.toUpperCase():"GET";a.l=b;a.h="";a.P=c;a.G=!1;a.c=!0;a.a=a.O?a.O.a():yh.a();a.A=a.O?xh(a.O):xh(yh);a.a.onreadystatechange=q(a.Ub,a);try{Qh(a.b,bi(a,"Opening Xhr")),a.N=!0,a.a.open(c,String(b),!0),a.N=!1;}catch(g){Qh(a.b,bi(a,"Error opening Xhr: "+g.message));ci(a,g);return}b=d||"";var f=new Ed(a.headers);e&&Dd(e,function(g,h){f.set(h,g);});e=Ra(f.Y());d=l.FormData&&b instanceof
    l.FormData;!Ta($h,c)||e||d||f.set("Content-Type","application/x-www-form-urlencoded;charset=utf-8");f.forEach(function(g,h){this.a.setRequestHeader(h,g);},a);a.m&&(a.a.responseType=a.m);"withCredentials"in a.a&&a.a.withCredentials!==a.R&&(a.a.withCredentials=a.R);try{di(a),0<a.g&&(a.u=ei(a.a),Qh(a.b,bi(a,"Will abort after "+a.g+"ms if incomplete, xhr2 "+a.u)),a.u?(a.a.timeout=a.g,a.a.ontimeout=q(a.Ma,a)):a.o=zd(a.Ma,a.g,a)),Qh(a.b,bi(a,"Sending request")),a.i=!0,a.a.send(b),a.i=!1;}catch(g){Qh(a.b,
    bi(a,"Send error: "+g.message)),ci(a,g);}}function ei(a){return Tb&&cc(9)&&"number"===typeof a.timeout&&void 0!==a.ontimeout}function Sa(a){return "content-type"==a.toLowerCase()}k=Xh.prototype;k.Ma=function(){"undefined"!=typeof ha&&this.a&&(this.h="Timed out after "+this.g+"ms, aborting",Qh(this.b,bi(this,this.h)),this.dispatchEvent("timeout"),this.abort(8));};function ci(a,b){a.c=!1;a.a&&(a.f=!0,a.a.abort(),a.f=!1);a.h=b;fi(a);gi(a);}
    function fi(a){a.G||(a.G=!0,a.dispatchEvent("complete"),a.dispatchEvent("error"));}k.abort=function(){this.a&&this.c&&(Qh(this.b,bi(this,"Aborting")),this.c=!1,this.f=!0,this.a.abort(),this.f=!1,this.dispatchEvent("complete"),this.dispatchEvent("abort"),gi(this));};k.Da=function(){this.a&&(this.c&&(this.c=!1,this.f=!0,this.a.abort(),this.f=!1),gi(this,!0));Xh.$a.Da.call(this);};k.Ub=function(){this.xa||(this.N||this.i||this.f?hi(this):this.Ic());};k.Ic=function(){hi(this);};
    function hi(a){if(a.c&&"undefined"!=typeof ha)if(a.A[1]&&4==ii(a)&&2==ji(a))Qh(a.b,bi(a,"Local request error detected and ignored"));else if(a.i&&4==ii(a))zd(a.Ub,0,a);else if(a.dispatchEvent("readystatechange"),4==ii(a)){Qh(a.b,bi(a,"Request complete"));a.c=!1;try{var b=ji(a);a:switch(b){case 200:case 201:case 202:case 204:case 206:case 304:case 1223:var c=!0;break a;default:c=!1;}var d;if(!(d=c)){var e;if(e=0===b){var f=String(a.l).match(Hd)[1]||null;if(!f&&l.self&&l.self.location){var g=l.self.location.protocol;
    f=g.substr(0,g.length-1);}e=!Zh.test(f?f.toLowerCase():"");}d=e;}if(d)a.dispatchEvent("complete"),a.dispatchEvent("success");else {try{var h=2<ii(a)?a.a.statusText:"";}catch(m){Qh(a.b,"Can not get status: "+m.message),h="";}a.h=h+" ["+ji(a)+"]";fi(a);}}finally{gi(a);}}}function gi(a,b){if(a.a){di(a);var c=a.a,d=a.A[0]?ka:null;a.a=null;a.A=null;b||a.dispatchEvent("ready");try{c.onreadystatechange=d;}catch(e){(a=a.b)&&a.log(Ih,"Problem encountered resetting onreadystatechange: "+e.message,void 0);}}}
    function di(a){a.a&&a.u&&(a.a.ontimeout=null);a.o&&(l.clearTimeout(a.o),a.o=null);}function ii(a){return a.a?a.a.readyState:0}function ji(a){try{return 2<ii(a)?a.a.status:-1}catch(b){return -1}}function ki(a){try{return a.a?a.a.responseText:""}catch(b){return Qh(a.b,"Can not get responseText: "+b.message),""}}
    k.getResponse=function(){try{if(!this.a)return null;if("response"in this.a)return this.a.response;switch(this.m){case Yh:case "text":return this.a.responseText;case "arraybuffer":if("mozResponseArrayBuffer"in this.a)return this.a.mozResponseArrayBuffer}var a=this.b;a&&a.log(Ih,"Response type "+this.m+" is not supported on this browser",void 0);return null}catch(b){return Qh(this.b,"Can not get response: "+b.message),null}};function bi(a,b){return b+" ["+a.P+" "+a.l+" "+ji(a)+"]"}function li(a){var b=mi;this.g=[];this.u=b;this.o=a||null;this.f=this.a=!1;this.c=void 0;this.m=this.A=this.i=!1;this.h=0;this.b=null;this.l=0;}li.prototype.cancel=function(a){if(this.a)this.c instanceof li&&this.c.cancel();else {if(this.b){var b=this.b;delete this.b;a?b.cancel(a):(b.l--,0>=b.l&&b.cancel());}this.u?this.u.call(this.o,this):this.m=!0;this.a||(a=new ni(this),oi(this),pi(this,!1,a));}};li.prototype.v=function(a,b){this.i=!1;pi(this,a,b);};function pi(a,b,c){a.a=!0;a.c=c;a.f=!b;qi(a);}
    function oi(a){if(a.a){if(!a.m)throw new ri(a);a.m=!1;}}function si(a,b){ti(a,null,b,void 0);}function ti(a,b,c,d){a.g.push([b,c,d]);a.a&&qi(a);}li.prototype.then=function(a,b,c){var d,e,f=new C(function(g,h){d=g;e=h;});ti(this,d,function(g){g instanceof ni?f.cancel():e(g);});return f.then(a,b,c)};li.prototype.$goog_Thenable=!0;function ui(a){return Qa(a.g,function(b){return na(b[1])})}
    function qi(a){if(a.h&&a.a&&ui(a)){var b=a.h,c=vi[b];c&&(l.clearTimeout(c.a),delete vi[b]);a.h=0;}a.b&&(a.b.l--,delete a.b);b=a.c;for(var d=c=!1;a.g.length&&!a.i;){var e=a.g.shift(),f=e[0],g=e[1];e=e[2];if(f=a.f?g:f)try{var h=f.call(e||a.o,b);void 0!==h&&(a.f=a.f&&(h==b||h instanceof Error),a.c=b=h);if(Ca(b)||"function"===typeof l.Promise&&b instanceof l.Promise)d=!0,a.i=!0;}catch(m){b=m,a.f=!0,ui(a)||(c=!0);}}a.c=b;d&&(h=q(a.v,a,!0),d=q(a.v,a,!1),b instanceof li?(ti(b,h,d),b.A=!0):b.then(h,d));c&&(b=
    new wi(b),vi[b.a]=b,a.h=b.a);}function ri(){u.call(this);}r(ri,u);ri.prototype.message="Deferred has already fired";ri.prototype.name="AlreadyCalledError";function ni(){u.call(this);}r(ni,u);ni.prototype.message="Deferred was canceled";ni.prototype.name="CanceledError";function wi(a){this.a=l.setTimeout(q(this.c,this),0);this.b=a;}wi.prototype.c=function(){delete vi[this.a];throw this.b;};var vi={};function xi(a){var c=document,d=wb(a).toString(),e=jc(document,"SCRIPT"),f={Vb:e,Ma:void 0},g=new li(f),h=null,m=5E3;(h=window.setTimeout(function(){yi(e,!0);var p=new zi(Ai,"Timeout reached for loading script "+d);oi(g);pi(g,!1,p);},m),f.Ma=h);e.onload=e.onreadystatechange=function(){e.readyState&&"loaded"!=e.readyState&&"complete"!=e.readyState||(yi(e,!1,h),oi(g),pi(g,!0,null));};e.onerror=function(){yi(e,!0,h);var p=new zi(Bi,"Error while loading script "+
    d);oi(g);pi(g,!1,p);};f={};z(f,{type:"text/javascript",charset:"UTF-8"});gc(e,f);Mb(e,a);Ci(c).appendChild(e);return g}function Ci(a){var b;return (b=(a||document).getElementsByTagName("HEAD"))&&0!=b.length?b[0]:a.documentElement}function mi(){if(this&&this.Vb){var a=this.Vb;a&&"SCRIPT"==a.tagName&&yi(a,!0,this.Ma);}}
    function yi(a,b,c){null!=c&&l.clearTimeout(c);a.onload=ka;a.onerror=ka;a.onreadystatechange=ka;b&&window.setTimeout(function(){a&&a.parentNode&&a.parentNode.removeChild(a);},0);}var Bi=0,Ai=1;function zi(a,b){var c="Jsloader error (code #"+a+")";b&&(c+=": "+b);u.call(this,c);this.code=a;}r(zi,u);function Di(a){this.f=a;}r(Di,wh);Di.prototype.a=function(){return new this.f};Di.prototype.b=function(){return {}};
    function Ei(a,b,c){this.c=a;a=b||{};this.l=a.secureTokenEndpoint||"https://securetoken.googleapis.com/v1/token";this.v=a.secureTokenTimeout||Fi;this.g=lb(a.secureTokenHeaders||Gi);this.h=a.firebaseEndpoint||"https://www.googleapis.com/identitytoolkit/v3/relyingparty/";this.i=a.identityPlatformEndpoint||"https://identitytoolkit.googleapis.com/v2/";this.m=a.firebaseTimeout||Hi;this.a=lb(a.firebaseHeaders||Ii);c&&(this.a["X-Client-Version"]=c,this.g["X-Client-Version"]=c);c="Node"==Fe();c=l.XMLHttpRequest||
    c&&firebase.INTERNAL.node&&firebase.INTERNAL.node.XMLHttpRequest;if(!c&&!Ee())throw new t("internal-error","The XMLHttpRequest compatibility library was not found.");this.f=void 0;Ee()?this.f=new Rh(self):Ge()?this.f=new Di(c):this.f=new Bh;this.b=null;}var Ji,zg="idToken",Fi=new Ue(3E4,6E4),Gi={"Content-Type":"application/x-www-form-urlencoded"},Hi=new Ue(3E4,6E4),Ii={"Content-Type":"application/json"};function Ki(a,b){b?a.a["X-Firebase-Locale"]=b:delete a.a["X-Firebase-Locale"];}
    function Li(a,b){b&&(a.l=Mi("https://securetoken.googleapis.com/v1/token",b),a.h=Mi("https://www.googleapis.com/identitytoolkit/v3/relyingparty/",b),a.i=Mi("https://identitytoolkit.googleapis.com/v2/",b));}function Mi(a,b){a=J(a);b=J(b.url);a.c=a.a+a.c;Kd(a,b.f);a.a=b.a;Ld(a,b.g);return a.toString()}function Ni(a,b){b?(a.a["X-Client-Version"]=b,a.g["X-Client-Version"]=b):(delete a.a["X-Client-Version"],delete a.g["X-Client-Version"]);}Ei.prototype.S=function(){return this.b};
    function Oi(a,b,c,d,e,f,g){pe()||Ee()?a=q(a.u,a):(Ji||(Ji=new C(function(h,m){Pi(h,m);})),a=q(a.o,a));a(b,c,d,e,f,g);}
    Ei.prototype.u=function(a,b,c,d,e,f){if(Ee()&&("undefined"===typeof l.fetch||"undefined"===typeof l.Headers||"undefined"===typeof l.Request))throw new t("operation-not-supported-in-this-environment","fetch, Headers and Request native APIs or equivalent Polyfills must be available to support HTTP requests from a Worker environment.");var g=new Xh(this.f);if(f){g.g=Math.max(0,f);var h=setTimeout(function(){g.dispatchEvent("timeout");},f);}md(g,"complete",function(){h&&clearTimeout(h);var m=null;try{m=
    JSON.parse(ki(this))||null;}catch(p){m=null;}b&&b(m);});sd(g,"ready",function(){h&&clearTimeout(h);Tc(this);});sd(g,"timeout",function(){h&&clearTimeout(h);Tc(this);b&&b(null);});ai(g,a,c,d,e);};var Qi=new ob(pb,"https://apis.google.com/js/client.js?onload=%{onload}"),Ri="__fcb"+Math.floor(1E6*Math.random()).toString();
    function Pi(a,b){if(((window.gapi||{}).client||{}).request)a();else {l[Ri]=function(){((window.gapi||{}).client||{}).request?a():b(Error("CORS_UNSUPPORTED"));};var c=xb(Qi,{onload:Ri});si(xi(c),function(){b(Error("CORS_UNSUPPORTED"));});}}
    Ei.prototype.o=function(a,b,c,d,e){var f=this;Ji.then(function(){window.gapi.client.setApiKey(f.c);var g=window.gapi.auth.getToken();window.gapi.auth.setToken(null);window.gapi.client.request({path:a,method:c,body:d,headers:e,authType:"none",callback:function(h){window.gapi.auth.setToken(g);b&&b(h);}});}).s(function(g){b&&b({error:{message:g&&g.message||"CORS_UNSUPPORTED"}});});};
    function Si(a,b){return new C(function(c,d){"refresh_token"==b.grant_type&&b.refresh_token||"authorization_code"==b.grant_type&&b.code?Oi(a,a.l+"?key="+encodeURIComponent(a.c),function(e){e?e.error?d(Ti(e)):e.access_token&&e.refresh_token?c(e):d(new t("internal-error")):d(new t("network-request-failed"));},"POST",ae(b).toString(),a.g,a.v.get()):d(new t("internal-error"));})}
    function Ui(a,b,c,d,e,f,g){var h=J(b+c);I(h,"key",a.c);g&&I(h,"cb",ua().toString());var m="GET"==d;if(m)for(var p in e)e.hasOwnProperty(p)&&I(h,p,e[p]);return new C(function(v,B){Oi(a,h.toString(),function(A){A?A.error?B(Ti(A,f||{})):v(A):B(new t("network-request-failed"));},d,m?void 0:fe(Qe(e)),a.a,a.m.get());})}function Vi(a){a=a.email;if("string"!==typeof a||!ye.test(a))throw new t("invalid-email");}function Wi(a){"email"in a&&Vi(a);}
    function Xi(a,b){return O(a,Yi,{identifier:b,continueUri:Ne()?me():"http://localhost"}).then(function(c){return c.signinMethods||[]})}function Zi(a){return O(a,$i,{}).then(function(b){return b.authorizedDomains||[]})}function P(a){if(!a[zg]){if(a.mfaPendingCredential)throw new t("multi-factor-auth-required",null,lb(a));throw new t("internal-error");}}
    function aj(a){if(a.phoneNumber||a.temporaryProof){if(!a.phoneNumber||!a.temporaryProof)throw new t("internal-error");}else {if(!a.sessionInfo)throw new t("missing-verification-id");if(!a.code)throw new t("missing-verification-code");}}Ei.prototype.yb=function(){return O(this,bj,{})};Ei.prototype.Ab=function(a,b){return O(this,cj,{idToken:a,email:b})};Ei.prototype.Bb=function(a,b){return O(this,Zg,{idToken:a,password:b})};var dj={displayName:"DISPLAY_NAME",photoUrl:"PHOTO_URL"};k=Ei.prototype;
    k.Cb=function(a,b){var c={idToken:a},d=[];jb(dj,function(e,f){var g=b[f];null===g?d.push(e):f in b&&(c[f]=g);});d.length&&(c.deleteAttribute=d);return O(this,cj,c)};k.ub=function(a,b){a={requestType:"PASSWORD_RESET",email:a};z(a,b);return O(this,ej,a)};k.vb=function(a,b){a={requestType:"EMAIL_SIGNIN",email:a};z(a,b);return O(this,fj,a)};k.tb=function(a,b){a={requestType:"VERIFY_EMAIL",idToken:a};z(a,b);return O(this,gj,a)};
    k.Db=function(a,b,c){a={requestType:"VERIFY_AND_CHANGE_EMAIL",idToken:a,newEmail:b};z(a,c);return O(this,hj,a)};function kh(a,b){return O(a,ij,b)}k.eb=function(a){return O(this,jj,a)};function ih(a,b){return O(a,kj,b).then(function(c){return c.phoneSessionInfo.sessionInfo})}
    function lj(a){if(!a.phoneVerificationInfo)throw new t("internal-error");if(!a.phoneVerificationInfo.sessionInfo)throw new t("missing-verification-id");if(!a.phoneVerificationInfo.code)throw new t("missing-verification-code");}function jh(a,b){return O(a,mj,b).then(function(c){return c.phoneResponseInfo.sessionInfo})}function nj(a,b,c){return O(a,oj,{idToken:b,deleteProvider:c})}function pj(a){if(!a.requestUri||!a.sessionId&&!a.postBody&&!a.pendingToken)throw new t("internal-error");}
    function qj(a,b){b.oauthIdToken&&b.providerId&&0==b.providerId.indexOf("oidc.")&&!b.pendingToken&&(a.sessionId?b.nonce=a.sessionId:a.postBody&&(a=new Pd(a.postBody),ee(a,"nonce")&&(b.nonce=a.get("nonce"))));return b}
    function rj(a){var b=null;a.needConfirmation?(a.code="account-exists-with-different-credential",b=vh(a)):"FEDERATED_USER_ID_ALREADY_LINKED"==a.errorMessage?(a.code="credential-already-in-use",b=vh(a)):"EMAIL_EXISTS"==a.errorMessage?(a.code="email-already-in-use",b=vh(a)):a.errorMessage&&(b=sj(a.errorMessage));if(b)throw b;P(a);}function Bg(a,b){b.returnIdpCredential=!0;return O(a,tj,b)}function Dg(a,b){b.returnIdpCredential=!0;return O(a,uj,b)}
    function Eg(a,b){b.returnIdpCredential=!0;b.autoCreate=!1;return O(a,vj,b)}function wj(a){if(!a.oobCode)throw new t("invalid-action-code");}k.mb=function(a,b){return O(this,xj,{oobCode:a,newPassword:b})};k.Qa=function(a){return O(this,yj,{oobCode:a})};k.ib=function(a){return O(this,zj,{oobCode:a})};
    var zj={endpoint:"setAccountInfo",B:wj,Z:"email",C:!0},yj={endpoint:"resetPassword",B:wj,F:function(a){var b=a.requestType;if(!b||!a.email&&"EMAIL_SIGNIN"!=b&&"VERIFY_AND_CHANGE_EMAIL"!=b)throw new t("internal-error");},C:!0},Aj={endpoint:"signupNewUser",B:function(a){Vi(a);if(!a.password)throw new t("weak-password");},F:P,U:!0,C:!0},Yi={endpoint:"createAuthUri",C:!0},Bj={endpoint:"deleteAccount",M:["idToken"]},oj={endpoint:"setAccountInfo",M:["idToken","deleteProvider"],B:function(a){if("array"!=
    la(a.deleteProvider))throw new t("internal-error");}},Wg={endpoint:"emailLinkSignin",M:["email","oobCode"],B:Vi,F:P,U:!0,C:!0},Yg={endpoint:"emailLinkSignin",M:["idToken","email","oobCode"],B:Vi,F:P,U:!0},Cj={endpoint:"accounts/mfaEnrollment:finalize",M:["idToken","phoneVerificationInfo"],B:lj,F:P,C:!0,Na:!0},Dj={endpoint:"accounts/mfaSignIn:finalize",M:["mfaPendingCredential","phoneVerificationInfo"],B:lj,F:P,C:!0,Na:!0},Ej={endpoint:"getAccountInfo"},fj={endpoint:"getOobConfirmationCode",M:["requestType"],
    B:function(a){if("EMAIL_SIGNIN"!=a.requestType)throw new t("internal-error");Vi(a);},Z:"email",C:!0},gj={endpoint:"getOobConfirmationCode",M:["idToken","requestType"],B:function(a){if("VERIFY_EMAIL"!=a.requestType)throw new t("internal-error");},Z:"email",C:!0},hj={endpoint:"getOobConfirmationCode",M:["idToken","newEmail","requestType"],B:function(a){if("VERIFY_AND_CHANGE_EMAIL"!=a.requestType)throw new t("internal-error");},Z:"email",C:!0},ej={endpoint:"getOobConfirmationCode",M:["requestType"],B:function(a){if("PASSWORD_RESET"!=
    a.requestType)throw new t("internal-error");Vi(a);},Z:"email",C:!0},$i={kb:!0,endpoint:"getProjectConfig",Tb:"GET"},Fj={kb:!0,endpoint:"getRecaptchaParam",Tb:"GET",F:function(a){if(!a.recaptchaSiteKey)throw new t("internal-error");}},xj={endpoint:"resetPassword",B:wj,Z:"email",C:!0},ij={endpoint:"sendVerificationCode",M:["phoneNumber","recaptchaToken"],Z:"sessionInfo",C:!0},cj={endpoint:"setAccountInfo",M:["idToken"],B:Wi,U:!0},Zg={endpoint:"setAccountInfo",M:["idToken"],B:function(a){Wi(a);if(!a.password)throw new t("weak-password");
    },F:P,U:!0},bj={endpoint:"signupNewUser",F:P,U:!0,C:!0},kj={endpoint:"accounts/mfaEnrollment:start",M:["idToken","phoneEnrollmentInfo"],B:function(a){if(!a.phoneEnrollmentInfo)throw new t("internal-error");if(!a.phoneEnrollmentInfo.phoneNumber)throw new t("missing-phone-number");if(!a.phoneEnrollmentInfo.recaptchaToken)throw new t("missing-app-credential");},F:function(a){if(!a.phoneSessionInfo||!a.phoneSessionInfo.sessionInfo)throw new t("internal-error");},C:!0,Na:!0},mj={endpoint:"accounts/mfaSignIn:start",
    M:["mfaPendingCredential","mfaEnrollmentId","phoneSignInInfo"],B:function(a){if(!a.phoneSignInInfo||!a.phoneSignInInfo.recaptchaToken)throw new t("missing-app-credential");},F:function(a){if(!a.phoneResponseInfo||!a.phoneResponseInfo.sessionInfo)throw new t("internal-error");},C:!0,Na:!0},tj={endpoint:"verifyAssertion",B:pj,Xa:qj,F:rj,U:!0,C:!0},vj={endpoint:"verifyAssertion",B:pj,Xa:qj,F:function(a){if(a.errorMessage&&"USER_NOT_FOUND"==a.errorMessage)throw new t("user-not-found");if(a.errorMessage)throw sj(a.errorMessage);
    P(a);},U:!0,C:!0},uj={endpoint:"verifyAssertion",B:function(a){pj(a);if(!a.idToken)throw new t("internal-error");},Xa:qj,F:rj,U:!0},Gj={endpoint:"verifyCustomToken",B:function(a){if(!a.token)throw new t("invalid-custom-token");},F:P,U:!0,C:!0},Xg={endpoint:"verifyPassword",B:function(a){Vi(a);if(!a.password)throw new t("wrong-password");},F:P,U:!0,C:!0},jj={endpoint:"verifyPhoneNumber",B:aj,F:P,C:!0},eh={endpoint:"verifyPhoneNumber",B:function(a){if(!a.idToken)throw new t("internal-error");aj(a);},
    F:function(a){if(a.temporaryProof)throw a.code="credential-already-in-use",vh(a);P(a);}},fh={Gb:{USER_NOT_FOUND:"user-not-found"},endpoint:"verifyPhoneNumber",B:aj,F:P,C:!0},Hj={endpoint:"accounts/mfaEnrollment:withdraw",M:["idToken","mfaEnrollmentId"],F:function(a){if(!!a[zg]^!!a.refreshToken)throw new t("internal-error");},C:!0,Na:!0};
    function O(a,b,c){if(!hf(c,b.M))return E(new t("internal-error"));var d=!!b.Na,e=b.Tb||"POST",f;return D(c).then(b.B).then(function(){b.U&&(c.returnSecureToken=!0);b.C&&a.b&&"undefined"===typeof c.tenantId&&(c.tenantId=a.b);return d?Ui(a,a.i,b.endpoint,e,c,b.Gb,b.kb||!1):Ui(a,a.h,b.endpoint,e,c,b.Gb,b.kb||!1)}).then(function(g){f=g;return b.Xa?b.Xa(c,f):f}).then(b.F).then(function(){if(!b.Z)return f;if(!(b.Z in f))throw new t("internal-error");return f[b.Z]})}
    function sj(a){return Ti({error:{errors:[{message:a}],code:400,message:a}})}
    function Ti(a,b){var c=(a.error&&a.error.errors&&a.error.errors[0]||{}).reason||"";var d={keyInvalid:"invalid-api-key",ipRefererBlocked:"app-not-authorized"};if(c=d[c]?new t(d[c]):null)return c;c=a.error&&a.error.message||"";d={INVALID_CUSTOM_TOKEN:"invalid-custom-token",CREDENTIAL_MISMATCH:"custom-token-mismatch",MISSING_CUSTOM_TOKEN:"internal-error",INVALID_IDENTIFIER:"invalid-email",MISSING_CONTINUE_URI:"internal-error",INVALID_EMAIL:"invalid-email",INVALID_PASSWORD:"wrong-password",USER_DISABLED:"user-disabled",
    MISSING_PASSWORD:"internal-error",EMAIL_EXISTS:"email-already-in-use",PASSWORD_LOGIN_DISABLED:"operation-not-allowed",INVALID_IDP_RESPONSE:"invalid-credential",INVALID_PENDING_TOKEN:"invalid-credential",FEDERATED_USER_ID_ALREADY_LINKED:"credential-already-in-use",MISSING_OR_INVALID_NONCE:"missing-or-invalid-nonce",INVALID_MESSAGE_PAYLOAD:"invalid-message-payload",INVALID_RECIPIENT_EMAIL:"invalid-recipient-email",INVALID_SENDER:"invalid-sender",EMAIL_NOT_FOUND:"user-not-found",RESET_PASSWORD_EXCEED_LIMIT:"too-many-requests",
    EXPIRED_OOB_CODE:"expired-action-code",INVALID_OOB_CODE:"invalid-action-code",MISSING_OOB_CODE:"internal-error",INVALID_PROVIDER_ID:"invalid-provider-id",CREDENTIAL_TOO_OLD_LOGIN_AGAIN:"requires-recent-login",INVALID_ID_TOKEN:"invalid-user-token",TOKEN_EXPIRED:"user-token-expired",USER_NOT_FOUND:"user-token-expired",CORS_UNSUPPORTED:"cors-unsupported",DYNAMIC_LINK_NOT_ACTIVATED:"dynamic-link-not-activated",INVALID_APP_ID:"invalid-app-id",TOO_MANY_ATTEMPTS_TRY_LATER:"too-many-requests",WEAK_PASSWORD:"weak-password",
    OPERATION_NOT_ALLOWED:"operation-not-allowed",USER_CANCELLED:"user-cancelled",CAPTCHA_CHECK_FAILED:"captcha-check-failed",INVALID_APP_CREDENTIAL:"invalid-app-credential",INVALID_CODE:"invalid-verification-code",INVALID_PHONE_NUMBER:"invalid-phone-number",INVALID_SESSION_INFO:"invalid-verification-id",INVALID_TEMPORARY_PROOF:"invalid-credential",MISSING_APP_CREDENTIAL:"missing-app-credential",MISSING_CODE:"missing-verification-code",MISSING_PHONE_NUMBER:"missing-phone-number",MISSING_SESSION_INFO:"missing-verification-id",
    QUOTA_EXCEEDED:"quota-exceeded",SESSION_EXPIRED:"code-expired",REJECTED_CREDENTIAL:"rejected-credential",INVALID_CONTINUE_URI:"invalid-continue-uri",MISSING_ANDROID_PACKAGE_NAME:"missing-android-pkg-name",MISSING_IOS_BUNDLE_ID:"missing-ios-bundle-id",UNAUTHORIZED_DOMAIN:"unauthorized-continue-uri",INVALID_DYNAMIC_LINK_DOMAIN:"invalid-dynamic-link-domain",INVALID_OAUTH_CLIENT_ID:"invalid-oauth-client-id",INVALID_CERT_HASH:"invalid-cert-hash",UNSUPPORTED_TENANT_OPERATION:"unsupported-tenant-operation",
    INVALID_TENANT_ID:"invalid-tenant-id",TENANT_ID_MISMATCH:"tenant-id-mismatch",ADMIN_ONLY_OPERATION:"admin-restricted-operation",INVALID_MFA_PENDING_CREDENTIAL:"invalid-multi-factor-session",MFA_ENROLLMENT_NOT_FOUND:"multi-factor-info-not-found",MISSING_MFA_PENDING_CREDENTIAL:"missing-multi-factor-session",MISSING_MFA_ENROLLMENT_ID:"missing-multi-factor-info",EMAIL_CHANGE_NEEDS_VERIFICATION:"email-change-needs-verification",SECOND_FACTOR_EXISTS:"second-factor-already-in-use",SECOND_FACTOR_LIMIT_EXCEEDED:"maximum-second-factor-count-exceeded",
    UNSUPPORTED_FIRST_FACTOR:"unsupported-first-factor",UNVERIFIED_EMAIL:"unverified-email"};z(d,b||{});b=(b=c.match(/^[^\s]+\s*:\s*([\s\S]*)$/))&&1<b.length?b[1]:void 0;for(var e in d)if(0===c.indexOf(e))return new t(d[e],b);!b&&a&&(b=Pe(a));return new t("internal-error",b)}function Ij(a){this.b=a;this.a=null;this.qb=Jj(this);}
    function Jj(a){return Kj().then(function(){return new C(function(b,c){L("gapi.iframes.getContext")().open({where:document.body,url:a.b,messageHandlersFilter:L("gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER"),attributes:{style:{position:"absolute",top:"-100px",width:"1px",height:"1px"}},dontclear:!0},function(d){function e(){clearTimeout(f);b();}a.a=d;a.a.restyle({setHideOnLeave:!1});var f=setTimeout(function(){c(Error("Network Error"));},Lj.get());d.ping(e).then(e,function(){c(Error("Network Error"));});});})})}
    function Mj(a,b){return a.qb.then(function(){return new C(function(c){a.a.send(b.type,b,c,L("gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER"));})})}function Nj(a,b){a.qb.then(function(){a.a.register("authEvent",b,L("gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER"));});}var Oj=new ob(pb,"https://apis.google.com/js/api.js?onload=%{onload}"),Pj=new Ue(3E4,6E4),Lj=new Ue(5E3,15E3),Qj=null;
    function Kj(){return Qj?Qj:Qj=(new C(function(a,b){function c(){Te();L("gapi.load")("gapi.iframes",{callback:a,ontimeout:function(){Te();b(Error("Network Error"));},timeout:Pj.get()});}if(L("gapi.iframes.Iframe"))a();else if(L("gapi.load"))c();else {var d="__iframefcb"+Math.floor(1E6*Math.random()).toString();l[d]=function(){L("gapi.load")?c():b(Error("Network Error"));};d=xb(Oj,{onload:d});D(xi(d)).s(function(){b(Error("Network Error"));});}})).s(function(a){Qj=null;throw a;})}function Rj(a,b,c,d){this.l=a;this.h=b;this.i=c;this.g=d;this.f=null;this.g?(a=J(this.g.url),a=Yd(a.f,a.a,a.g,"/emulator/auth/iframe")):a=Yd("https",this.l,null,"/__/auth/iframe");this.a=a;I(this.a,"apiKey",this.h);I(this.a,"appName",this.i);this.b=null;this.c=[];}Rj.prototype.toString=function(){this.f?I(this.a,"v",this.f):de(this.a.b,"v");this.b?I(this.a,"eid",this.b):de(this.a.b,"eid");this.c.length?I(this.a,"fw",this.c.join(",")):de(this.a.b,"fw");return this.a.toString()};
    function Sj(a,b,c,d,e,f){this.u=a;this.o=b;this.c=c;this.v=d;this.m=f;this.i=this.g=this.l=null;this.a=e;this.h=this.f=null;}Sj.prototype.xb=function(a){this.h=a;return this};
    Sj.prototype.toString=function(){if(this.m){var a=J(this.m.url);a=Yd(a.f,a.a,a.g,"/emulator/auth/handler");}else a=Yd("https",this.u,null,"/__/auth/handler");I(a,"apiKey",this.o);I(a,"appName",this.c);I(a,"authType",this.v);if(this.a.isOAuthProvider){var b=this.a;try{var c=firebase.app(this.c).auth().ka();}catch(h){c=null;}b.nb=c;I(a,"providerId",this.a.providerId);c=this.a;b=Qe(c.Hb);for(var d in b)b[d]=b[d].toString();d=c.Pc;b=lb(b);for(var e=0;e<d.length;e++){var f=d[e];f in b&&delete b[f];}c.ob&&
    c.nb&&!b[c.ob]&&(b[c.ob]=c.nb);kb(b)||I(a,"customParameters",Pe(b));}"function"===typeof this.a.Pb&&(c=this.a.Pb(),c.length&&I(a,"scopes",c.join(",")));this.l?I(a,"redirectUrl",this.l):de(a.b,"redirectUrl");this.g?I(a,"eventId",this.g):de(a.b,"eventId");this.i?I(a,"v",this.i):de(a.b,"v");if(this.b)for(var g in this.b)this.b.hasOwnProperty(g)&&!Xd(a,g)&&I(a,g,this.b[g]);this.h?I(a,"tid",this.h):de(a.b,"tid");this.f?I(a,"eid",this.f):de(a.b,"eid");g=Tj(this.c);g.length&&I(a,"fw",g.join(","));return a.toString()};
    function Tj(a){try{return firebase.app(a).auth().Ga()}catch(b){return []}}function Uj(a,b,c,d,e,f){this.o=a;this.g=b;this.b=c;this.f=f;this.c=d||null;this.i=e||null;this.l=this.u=this.A=null;this.h=[];this.v=this.a=null;}
    function Vj(a){var b=me();return Zi(a).then(function(c){a:{var d=J(b),e=d.f;d=d.a;for(var f=0;f<c.length;f++){var g=c[f];var h=d;var m=e;0==g.indexOf("chrome-extension://")?h=J(g).a==h&&"chrome-extension"==m:"http"!=m&&"https"!=m?h=!1:xe.test(g)?h=h==g:(g=g.split(".").join("\\."),h=(new RegExp("^(.+\\."+g+"|"+g+")$","i")).test(h));if(h){c=!0;break a}}c=!1;}if(!c)throw new th(me());})}
    function Wj(a){if(a.v)return a.v;a.v=ze().then(function(){if(!a.u){var b=a.c,c=a.i,d=Tj(a.b),e=new Rj(a.o,a.g,a.b,a.f);e.f=b;e.b=c;e.c=Xa(d||[]);a.u=e.toString();}a.m=new Ij(a.u);Xj(a);});return a.v}k=Uj.prototype;k.Nb=function(a,b,c){var d=new t("popup-closed-by-user"),e=new t("web-storage-unsupported"),f=this,g=!1;return this.la().then(function(){Yj(f).then(function(h){h||(a&&te(a),b(e),g=!0);});}).s(function(){}).then(function(){if(!g)return we(a)}).then(function(){if(!g)return Ad(c).then(function(){b(d);})})};
    k.Wb=function(){var a=K();return !Oe(a)&&!Se(a)};k.Sb=function(){return !1};
    k.Lb=function(a,b,c,d,e,f,g,h){if(!a)return E(new t("popup-blocked"));if(g&&!Oe())return this.la().s(function(p){te(a);e(p);}),d(),D();this.a||(this.a=Vj(Zj(this)));var m=this;return this.a.then(function(){var p=m.la().s(function(v){te(a);e(v);throw v;});d();return p}).then(function(){nh(c);if(!g){var p=ak(m.o,m.g,m.b,b,c,null,f,m.c,void 0,m.i,h,m.f);ne(p,a);}}).s(function(p){"auth/network-request-failed"==p.code&&(m.a=null);throw p;})};
    function Zj(a){a.l||(a.A=a.c?Je(a.c,Tj(a.b)):null,a.l=new Ei(a.g,Aa(a.i),a.A),a.f&&Li(a.l,a.f));return a.l}k.Mb=function(a,b,c,d){this.a||(this.a=Vj(Zj(this)));var e=this;return this.a.then(function(){nh(b);var f=ak(e.o,e.g,e.b,a,b,me(),c,e.c,void 0,e.i,d,e.f);ne(f);}).s(function(f){"auth/network-request-failed"==f.code&&(e.a=null);throw f;})};k.la=function(){var a=this;return Wj(this).then(function(){return a.m.qb}).s(function(){a.a=null;throw new t("network-request-failed");})};k.Zb=function(){return !0};
    function ak(a,b,c,d,e,f,g,h,m,p,v,B){a=new Sj(a,b,c,d,e,B);a.l=f;a.g=g;a.i=h;a.b=lb(m||null);a.f=p;return a.xb(v).toString()}function Xj(a){if(!a.m)throw Error("IfcHandler must be initialized!");Nj(a.m,function(b){var c={};if(b&&b.authEvent){var d=!1;b=ph(b.authEvent);for(c=0;c<a.h.length;c++)d=a.h[c](b)||d;c={};c.status=d?"ACK":"ERROR";return D(c)}c.status="ERROR";return D(c)});}
    function Yj(a){var b={type:"webStorageSupport"};return Wj(a).then(function(){return Mj(a.m,b)}).then(function(c){if(c&&c.length&&"undefined"!==typeof c[0].webStorageSupport)return c[0].webStorageSupport;throw Error();})}k.Ea=function(a){this.h.push(a);};k.Ra=function(a){Va(this.h,function(b){return b==a});};function bk(a){this.a=a||firebase.INTERNAL.reactNative&&firebase.INTERNAL.reactNative.AsyncStorage;if(!this.a)throw new t("internal-error","The React Native compatibility library was not found.");this.type="asyncStorage";}k=bk.prototype;k.get=function(a){return D(this.a.getItem(a)).then(function(b){return b&&Re(b)})};k.set=function(a,b){return D(this.a.setItem(a,Pe(b)))};k.T=function(a){return D(this.a.removeItem(a))};k.ca=function(){};k.ia=function(){};function ck(a){this.b=a;this.a={};this.f=q(this.c,this);}var dk=[];function ek(){var a=Ee()?self:null;w(dk,function(c){c.b==a&&(b=c);});if(!b){var b=new ck(a);dk.push(b);}return b}
    ck.prototype.c=function(a){var b=a.data.eventType,c=a.data.eventId,d=this.a[b];if(d&&0<d.length){a.ports[0].postMessage({status:"ack",eventId:c,eventType:b,response:null});var e=[];w(d,function(f){e.push(D().then(function(){return f(a.origin,a.data.data)}));});Fc(e).then(function(f){var g=[];w(f,function(h){g.push({fulfilled:h.Ob,value:h.value,reason:h.reason?h.reason.message:void 0});});w(g,function(h){for(var m in h)"undefined"===typeof h[m]&&delete h[m];});a.ports[0].postMessage({status:"done",eventId:c,
    eventType:b,response:g});});}};function fk(a,b,c){kb(a.a)&&a.b.addEventListener("message",a.f);"undefined"===typeof a.a[b]&&(a.a[b]=[]);a.a[b].push(c);}function gk(a){this.a=a;}gk.prototype.postMessage=function(a,b){this.a.postMessage(a,b);};function hk(a){this.c=a;this.b=!1;this.a=[];}
    function ik(a,b,c,d){var e,f=c||{},g,h,m,p=null;if(a.b)return E(Error("connection_unavailable"));var v=d?800:50,B="undefined"!==typeof MessageChannel?new MessageChannel:null;return (new C(function(A,Q){B?(e=Math.floor(Math.random()*Math.pow(10,20)).toString(),B.port1.start(),h=setTimeout(function(){Q(Error("unsupported_event"));},v),g=function(xa){xa.data.eventId===e&&("ack"===xa.data.status?(clearTimeout(h),m=setTimeout(function(){Q(Error("timeout"));},3E3)):"done"===xa.data.status?(clearTimeout(m),
    "undefined"!==typeof xa.data.response?A(xa.data.response):Q(Error("unknown_error"))):(clearTimeout(h),clearTimeout(m),Q(Error("invalid_response"))));},p={messageChannel:B,onMessage:g},a.a.push(p),B.port1.addEventListener("message",g),a.c.postMessage({eventType:b,eventId:e,data:f},[B.port2])):Q(Error("connection_unavailable"));})).then(function(A){jk(a,p);return A}).s(function(A){jk(a,p);throw A;})}
    function jk(a,b){if(b){var c=b.messageChannel,d=b.onMessage;c&&(c.port1.removeEventListener("message",d),c.port1.close());Va(a.a,function(e){return e==b});}}hk.prototype.close=function(){for(;0<this.a.length;)jk(this,this.a[0]);this.b=!0;};function kk(){if(!lk())throw new t("web-storage-unsupported");this.c={};this.a=[];this.b=0;this.m=l.indexedDB;this.type="indexedDB";this.g=this.l=this.f=this.i=null;this.o=!1;this.h=null;var a=this;Ee()&&self?(this.l=ek(),fk(this.l,"keyChanged",function(b,c){return mk(a).then(function(d){0<d.length&&w(a.a,function(e){e(d);});return {keyProcessed:Ta(d,c.key)}})}),fk(this.l,"ping",function(){return D(["keyChanged"])})):af().then(function(b){if(a.h=b)a.g=new hk(new gk(b)),ik(a.g,"ping",null,!0).then(function(c){c[0].fulfilled&&
    Ta(c[0].value,"keyChanged")&&(a.o=!0);}).s(function(){});});}var nk;function ok(a){return new C(function(b,c){var d=a.m.deleteDatabase("firebaseLocalStorageDb");d.onsuccess=function(){b();};d.onerror=function(e){c(Error(e.target.error));};})}
    function pk(a){return new C(function(b,c){var d=a.m.open("firebaseLocalStorageDb",1);d.onerror=function(e){try{e.preventDefault();}catch(f){}c(Error(e.target.error));};d.onupgradeneeded=function(e){e=e.target.result;try{e.createObjectStore("firebaseLocalStorage",{keyPath:"fbase_key"});}catch(f){c(f);}};d.onsuccess=function(e){e=e.target.result;e.objectStoreNames.contains("firebaseLocalStorage")?b(e):ok(a).then(function(){return pk(a)}).then(function(f){b(f);}).s(function(f){c(f);});};})}
    function qk(a){a.v||(a.v=pk(a));return a.v}function lk(){try{return !!l.indexedDB}catch(a){return !1}}function rk(a){return a.objectStore("firebaseLocalStorage")}function sk(a,b){return a.transaction(["firebaseLocalStorage"],b?"readwrite":"readonly")}function tk(a){return new C(function(b,c){a.onsuccess=function(d){d&&d.target?b(d.target.result):b();};a.onerror=function(d){c(d.target.error);};})}k=kk.prototype;
    k.set=function(a,b){var c=!1,d,e=this;return qk(this).then(function(f){d=f;f=rk(sk(d,!0));return tk(f.get(a))}).then(function(f){var g=rk(sk(d,!0));if(f)return f.value=b,tk(g.put(f));e.b++;c=!0;f={};f.fbase_key=a;f.value=b;return tk(g.add(f))}).then(function(){e.c[a]=b;return uk(e,a)}).na(function(){c&&e.b--;})};function uk(a,b){return a.g&&a.h&&$e()===a.h?ik(a.g,"keyChanged",{key:b},a.o).then(function(){}).s(function(){}):D()}
    k.get=function(a){return qk(this).then(function(b){return tk(rk(sk(b,!1)).get(a))}).then(function(b){return b&&b.value})};k.T=function(a){var b=!1,c=this;return qk(this).then(function(d){b=!0;c.b++;return tk(rk(sk(d,!0))["delete"](a))}).then(function(){delete c.c[a];return uk(c,a)}).na(function(){b&&c.b--;})};
    function mk(a){return qk(a).then(function(b){var c=rk(sk(b,!1));return c.getAll?tk(c.getAll()):new C(function(d,e){var f=[],g=c.openCursor();g.onsuccess=function(h){(h=h.target.result)?(f.push(h.value),h["continue"]()):d(f);};g.onerror=function(h){e(h.target.error);};})}).then(function(b){var c={},d=[];if(0==a.b){for(d=0;d<b.length;d++)c[b[d].fbase_key]=b[d].value;d=oe(a.c,c);a.c=c;}return d})}k.ca=function(a){0==this.a.length&&vk(this);this.a.push(a);};
    k.ia=function(a){Va(this.a,function(b){return b==a});0==this.a.length&&wk(this);};function vk(a){function b(){a.f=setTimeout(function(){a.i=mk(a).then(function(c){0<c.length&&w(a.a,function(d){d(c);});}).then(function(){b();}).s(function(c){"STOP_EVENT"!=c.message&&b();});},800);}wk(a);b();}function wk(a){a.i&&a.i.cancel("STOP_EVENT");a.f&&(clearTimeout(a.f),a.f=null);}function xk(a){var b=this,c=null;this.a=[];this.type="indexedDB";this.c=a;this.b=D().then(function(){if(lk()){var d=Le(),e="__sak"+d;nk||(nk=new kk);c=nk;return c.set(e,d).then(function(){return c.get(e)}).then(function(f){if(f!==d)throw Error("indexedDB not supported!");return c.T(e)}).then(function(){return c}).s(function(){return b.c})}return b.c}).then(function(d){b.type=d.type;d.ca(function(e){w(b.a,function(f){f(e);});});return d});}k=xk.prototype;k.get=function(a){return this.b.then(function(b){return b.get(a)})};
    k.set=function(a,b){return this.b.then(function(c){return c.set(a,b)})};k.T=function(a){return this.b.then(function(b){return b.T(a)})};k.ca=function(a){this.a.push(a);};k.ia=function(a){Va(this.a,function(b){return b==a});};function yk(){this.a={};this.type="inMemory";}k=yk.prototype;k.get=function(a){return D(this.a[a])};k.set=function(a,b){this.a[a]=b;return D()};k.T=function(a){delete this.a[a];return D()};k.ca=function(){};k.ia=function(){};function zk(){if(!Ak()){if("Node"==Fe())throw new t("internal-error","The LocalStorage compatibility library was not found.");throw new t("web-storage-unsupported");}this.a=Bk()||firebase.INTERNAL.node.localStorage;this.type="localStorage";}function Bk(){try{var a=l.localStorage,b=Le();a&&(a.setItem(b,"1"),a.removeItem(b));return a}catch(c){return null}}
    function Ak(){var a="Node"==Fe();a=Bk()||a&&firebase.INTERNAL.node&&firebase.INTERNAL.node.localStorage;if(!a)return !1;try{return a.setItem("__sak","1"),a.removeItem("__sak"),!0}catch(b){return !1}}k=zk.prototype;k.get=function(a){var b=this;return D().then(function(){var c=b.a.getItem(a);return Re(c)})};k.set=function(a,b){var c=this;return D().then(function(){var d=Pe(b);null===d?c.T(a):c.a.setItem(a,d);})};k.T=function(a){var b=this;return D().then(function(){b.a.removeItem(a);})};
    k.ca=function(a){l.window&&jd(l.window,"storage",a);};k.ia=function(a){l.window&&G(l.window,"storage",a);};function Ck(){this.type="nullStorage";}k=Ck.prototype;k.get=function(){return D(null)};k.set=function(){return D()};k.T=function(){return D()};k.ca=function(){};k.ia=function(){};function Dk(){if(!Ek()){if("Node"==Fe())throw new t("internal-error","The SessionStorage compatibility library was not found.");throw new t("web-storage-unsupported");}this.a=Fk()||firebase.INTERNAL.node.sessionStorage;this.type="sessionStorage";}function Fk(){try{var a=l.sessionStorage,b=Le();a&&(a.setItem(b,"1"),a.removeItem(b));return a}catch(c){return null}}
    function Ek(){var a="Node"==Fe();a=Fk()||a&&firebase.INTERNAL.node&&firebase.INTERNAL.node.sessionStorage;if(!a)return !1;try{return a.setItem("__sak","1"),a.removeItem("__sak"),!0}catch(b){return !1}}k=Dk.prototype;k.get=function(a){var b=this;return D().then(function(){var c=b.a.getItem(a);return Re(c)})};k.set=function(a,b){var c=this;return D().then(function(){var d=Pe(b);null===d?c.T(a):c.a.setItem(a,d);})};k.T=function(a){var b=this;return D().then(function(){b.a.removeItem(a);})};k.ca=function(){};
    k.ia=function(){};function Gk(){var a={};a.Browser=Hk;a.Node=Ik;a.ReactNative=Jk;a.Worker=Kk;this.a=a[Fe()];}var Lk,Hk={D:zk,ab:Dk},Ik={D:zk,ab:Dk},Jk={D:bk,ab:Ck},Kk={D:zk,ab:Ck};/*

     Copyright 2017 Google LLC

     Licensed under the Apache License, Version 2.0 (the "License");
     you may not use this file except in compliance with the License.
     You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

     Unless required by applicable law or agreed to in writing, software
     distributed under the License is distributed on an "AS IS" BASIS,
     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     See the License for the specific language governing permissions and
     limitations under the License.
    */
    var Mk={qd:"local",NONE:"none",sd:"session"};function Nk(a){var b=new t("invalid-persistence-type"),c=new t("unsupported-persistence-type");a:{for(d in Mk)if(Mk[d]==a){var d=!0;break a}d=!1;}if(!d||"string"!==typeof a)throw b;switch(Fe()){case "ReactNative":if("session"===a)throw c;break;case "Node":if("none"!==a)throw c;break;case "Worker":if("session"===a||!lk()&&"none"!==a)throw c;break;default:if(!Ke()&&"none"!==a)throw c;}}
    function Ok(){var a=!Se(K())&&De()?!0:!1,b=Oe(),c=Ke();this.v=a;this.h=b;this.l=c;this.a={};Lk||(Lk=new Gk);a=Lk;try{this.g=!le()&&Ze()||!l.indexedDB?new a.a.D:new xk(Ee()?new yk:new a.a.D);}catch(d){this.g=new yk,this.h=!0;}try{this.i=new a.a.ab;}catch(d){this.i=new yk;}this.m=new yk;this.f=q(this.Xb,this);this.b={};}var Pk;function Qk(){Pk||(Pk=new Ok);return Pk}function Rk(a,b){switch(b){case "session":return a.i;case "none":return a.m;default:return a.g}}
    function Sk(a,b){return "firebase:"+a.name+(b?":"+b:"")}function Tk(a,b,c){var d=Sk(b,c),e=Rk(a,b.D);return a.get(b,c).then(function(f){var g=null;try{g=Re(l.localStorage.getItem(d));}catch(h){}if(g&&!f)return l.localStorage.removeItem(d),a.set(b,g,c);g&&f&&"localStorage"!=e.type&&l.localStorage.removeItem(d);})}k=Ok.prototype;k.get=function(a,b){return Rk(this,a.D).get(Sk(a,b))};function Uk(a,b,c){c=Sk(b,c);"local"==b.D&&(a.b[c]=null);return Rk(a,b.D).T(c)}
    k.set=function(a,b,c){var d=Sk(a,c),e=this,f=Rk(this,a.D);return f.set(d,b).then(function(){return f.get(d)}).then(function(g){"local"==a.D&&(e.b[d]=g);})};k.addListener=function(a,b,c){a=Sk(a,b);this.l&&(this.b[a]=l.localStorage.getItem(a));kb(this.a)&&(Rk(this,"local").ca(this.f),this.h||(le()||!Ze())&&l.indexedDB||!this.l||Vk(this));this.a[a]||(this.a[a]=[]);this.a[a].push(c);};
    k.removeListener=function(a,b,c){a=Sk(a,b);this.a[a]&&(Va(this.a[a],function(d){return d==c}),0==this.a[a].length&&delete this.a[a]);kb(this.a)&&(Rk(this,"local").ia(this.f),Wk(this));};function Vk(a){Wk(a);a.c=setInterval(function(){for(var b in a.a){var c=l.localStorage.getItem(b),d=a.b[b];c!=d&&(a.b[b]=c,c=new Yc({type:"storage",key:b,target:window,oldValue:d,newValue:c,a:!0}),a.Xb(c));}},1E3);}function Wk(a){a.c&&(clearInterval(a.c),a.c=null);}
    k.Xb=function(a){if(a&&a.g){var b=a.a.key;if(null==b)for(var c in this.a){var d=this.b[c];"undefined"===typeof d&&(d=null);var e=l.localStorage.getItem(c);e!==d&&(this.b[c]=e,this.lb(c));}else if(0==b.indexOf("firebase:")&&this.a[b]){"undefined"!==typeof a.a.a?Rk(this,"local").ia(this.f):Wk(this);if(this.v)if(c=l.localStorage.getItem(b),d=a.a.newValue,d!==c)null!==d?l.localStorage.setItem(b,d):l.localStorage.removeItem(b);else if(this.b[b]===d&&"undefined"===typeof a.a.a)return;var f=this;c=function(){if("undefined"!==
    typeof a.a.a||f.b[b]!==l.localStorage.getItem(b))f.b[b]=l.localStorage.getItem(b),f.lb(b);};Tb&&dc&&10==dc&&l.localStorage.getItem(b)!==a.a.newValue&&a.a.newValue!==a.a.oldValue?setTimeout(c,10):c();}}else w(a,q(this.lb,this));};k.lb=function(a){this.a[a]&&w(this.a[a],function(b){b();});};function Xk(a){this.a=a;this.b=Qk();}var Yk={name:"authEvent",D:"local"};function Zk(a){return a.b.get(Yk,a.a).then(function(b){return ph(b)})}function $k(){this.a=Qk();}function al(){this.b=-1;}function bl(a,b){this.b=cl;this.f=l.Uint8Array?new Uint8Array(this.b):Array(this.b);this.g=this.c=0;this.a=[];this.i=a;this.h=b;this.l=l.Int32Array?new Int32Array(64):Array(64);void 0===dl&&(l.Int32Array?dl=new Int32Array(el):dl=el);this.reset();}var dl;r(bl,al);for(var cl=64,fl=cl-1,gl=[],hl=0;hl<fl;hl++)gl[hl]=0;var il=Wa(128,gl);bl.prototype.reset=function(){this.g=this.c=0;this.a=l.Int32Array?new Int32Array(this.h):Xa(this.h);};
    function jl(a){for(var b=a.f,c=a.l,d=0,e=0;e<b.length;)c[d++]=b[e]<<24|b[e+1]<<16|b[e+2]<<8|b[e+3],e=4*d;for(b=16;64>b;b++){e=c[b-15]|0;d=c[b-2]|0;var f=(c[b-16]|0)+((e>>>7|e<<25)^(e>>>18|e<<14)^e>>>3)|0,g=(c[b-7]|0)+((d>>>17|d<<15)^(d>>>19|d<<13)^d>>>10)|0;c[b]=f+g|0;}d=a.a[0]|0;e=a.a[1]|0;var h=a.a[2]|0,m=a.a[3]|0,p=a.a[4]|0,v=a.a[5]|0,B=a.a[6]|0;f=a.a[7]|0;for(b=0;64>b;b++){var A=((d>>>2|d<<30)^(d>>>13|d<<19)^(d>>>22|d<<10))+(d&e^d&h^e&h)|0;g=p&v^~p&B;f=f+((p>>>6|p<<26)^(p>>>11|p<<21)^(p>>>25|p<<
    7))|0;g=g+(dl[b]|0)|0;g=f+(g+(c[b]|0)|0)|0;f=B;B=v;v=p;p=m+g|0;m=h;h=e;e=d;d=g+A|0;}a.a[0]=a.a[0]+d|0;a.a[1]=a.a[1]+e|0;a.a[2]=a.a[2]+h|0;a.a[3]=a.a[3]+m|0;a.a[4]=a.a[4]+p|0;a.a[5]=a.a[5]+v|0;a.a[6]=a.a[6]+B|0;a.a[7]=a.a[7]+f|0;}
    function kl(a,b,c){void 0===c&&(c=b.length);var d=0,e=a.c;if("string"===typeof b)for(;d<c;)a.f[e++]=b.charCodeAt(d++),e==a.b&&(jl(a),e=0);else if(ma(b))for(;d<c;){var f=b[d++];if(!("number"==typeof f&&0<=f&&255>=f&&f==(f|0)))throw Error("message must be a byte array");a.f[e++]=f;e==a.b&&(jl(a),e=0);}else throw Error("message must be string or array");a.c=e;a.g+=c;}
    var el=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,
    4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];function ll(){bl.call(this,8,ml);}r(ll,bl);var ml=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];function nl(a,b,c,d,e,f){this.m=a;this.i=b;this.l=c;this.v=d||null;this.u=e||null;this.o=f;this.h=b+":"+c;this.A=new $k;this.g=new Xk(this.h);this.f=null;this.b=[];this.a=this.c=null;}function ol(a){return new t("invalid-cordova-configuration",a)}k=nl.prototype;
    k.la=function(){return this.Ia?this.Ia:this.Ia=Ae().then(function(){if("function"!==typeof L("universalLinks.subscribe",l))throw ol("cordova-universal-links-plugin-fix is not installed");if("undefined"===typeof L("BuildInfo.packageName",l))throw ol("cordova-plugin-buildinfo is not installed");if("function"!==typeof L("cordova.plugins.browsertab.openUrl",l))throw ol("cordova-plugin-browsertab is not installed");if("function"!==typeof L("cordova.InAppBrowser.open",l))throw ol("cordova-plugin-inappbrowser is not installed");
    },function(){throw new t("cordova-not-ready");})};function pl(){for(var a=20,b=[];0<a;)b.push("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(62*Math.random()))),a--;return b.join("")}function ql(a){var b=new ll;kl(b,a);a=[];var c=8*b.g;56>b.c?kl(b,il,56-b.c):kl(b,il,b.b-(b.c-56));for(var d=63;56<=d;d--)b.f[d]=c&255,c/=256;jl(b);for(d=c=0;d<b.i;d++)for(var e=24;0<=e;e-=8)a[c++]=b.a[d]>>e&255;return Zf(a)}
    k.Nb=function(a,b){b(new t("operation-not-supported-in-this-environment"));return D()};k.Lb=function(){return E(new t("operation-not-supported-in-this-environment"))};k.Zb=function(){return !1};k.Wb=function(){return !0};k.Sb=function(){return !0};
    k.Mb=function(a,b,c,d){if(this.c)return E(new t("redirect-operation-pending"));var e=this,f=l.document,g=null,h=null,m=null,p=null;return this.c=D().then(function(){nh(b);return rl(e)}).then(function(){return sl(e,a,b,c,d)}).then(function(){return (new C(function(v,B){h=function(){var A=L("cordova.plugins.browsertab.close",l);v();"function"===typeof A&&A();e.a&&"function"===typeof e.a.close&&(e.a.close(),e.a=null);return !1};e.Ea(h);m=function(){g||(g=Ad(2E3).then(function(){B(new t("redirect-cancelled-by-user"));}));};
    p=function(){Ve()&&m();};f.addEventListener("resume",m,!1);K().toLowerCase().match(/android/)||f.addEventListener("visibilitychange",p,!1);})).s(function(v){return tl(e).then(function(){throw v;})})}).na(function(){m&&f.removeEventListener("resume",m,!1);p&&f.removeEventListener("visibilitychange",p,!1);g&&g.cancel();h&&e.Ra(h);e.c=null;})};
    function sl(a,b,c,d,e){var f=pl(),g=new oh(b,d,null,f,new t("no-auth-event"),null,e),h=L("BuildInfo.packageName",l);if("string"!==typeof h)throw new t("invalid-cordova-configuration");var m=L("BuildInfo.displayName",l),p={};if(K().toLowerCase().match(/iphone|ipad|ipod/))p.ibi=h;else if(K().toLowerCase().match(/android/))p.apn=h;else return E(new t("operation-not-supported-in-this-environment"));m&&(p.appDisplayName=m);f=ql(f);p.sessionId=f;var v=ak(a.m,a.i,a.l,b,c,null,d,a.v,p,a.u,e,a.o);return a.la().then(function(){var B=
    a.h;return a.A.a.set(Yk,g.w(),B)}).then(function(){var B=L("cordova.plugins.browsertab.isAvailable",l);if("function"!==typeof B)throw new t("invalid-cordova-configuration");var A=null;B(function(Q){if(Q){A=L("cordova.plugins.browsertab.openUrl",l);if("function"!==typeof A)throw new t("invalid-cordova-configuration");A(v);}else {A=L("cordova.InAppBrowser.open",l);if("function"!==typeof A)throw new t("invalid-cordova-configuration");Q=K();a.a=A(v,Q.match(/(iPad|iPhone|iPod).*OS 7_\d/i)||Q.match(/(iPad|iPhone|iPod).*OS 8_\d/i)?
    "_blank":"_system","location=yes");}});})}function ul(a,b){for(var c=0;c<a.b.length;c++)try{a.b[c](b);}catch(d){}}function rl(a){a.f||(a.f=a.la().then(function(){return new C(function(b){function c(d){b(d);a.Ra(c);return !1}a.Ea(c);vl(a);})}));return a.f}function tl(a){var b=null;return Zk(a.g).then(function(c){b=c;c=a.g;return Uk(c.b,Yk,c.a)}).then(function(){return b})}
    function vl(a){function b(g){d=!0;e&&e.cancel();tl(a).then(function(h){var m=c;if(h&&g&&g.url){var p=null;m=tg(g.url);-1!=m.indexOf("/__/auth/callback")&&(p=J(m),p=Re(Xd(p,"firebaseError")||null),p=(p="object"===typeof p?ya(p):null)?new oh(h.c,h.b,null,null,p,null,h.S()):new oh(h.c,h.b,m,h.f,null,null,h.S()));m=p||c;}ul(a,m);});}var c=new oh("unknown",null,null,null,new t("no-auth-event")),d=!1,e=Ad(500).then(function(){return tl(a).then(function(){d||ul(a,c);})}),f=l.handleOpenURL;l.handleOpenURL=function(g){0==
    g.toLowerCase().indexOf(L("BuildInfo.packageName",l).toLowerCase()+"://")&&b({url:g});if("function"===typeof f)try{f(g);}catch(h){console.error(h);}};rh||(rh=new qh);sh(b);}k.Ea=function(a){this.b.push(a);rl(this).s(function(b){"auth/invalid-cordova-configuration"===b.code&&(b=new oh("unknown",null,null,null,new t("no-auth-event")),a(b));});};k.Ra=function(a){Va(this.b,function(b){return b==a});};function wl(a){this.a=a;this.b=Qk();}var xl={name:"pendingRedirect",D:"session"};function yl(a){return a.b.set(xl,"pending",a.a)}function zl(a){return Uk(a.b,xl,a.a)}function Al(a){return a.b.get(xl,a.a).then(function(b){return "pending"==b})}function Bl(a,b,c,d){this.i={};this.u=0;this.O=a;this.m=b;this.v=c;this.G=d;this.h=[];this.f=!1;this.l=q(this.o,this);this.b=new Cl;this.A=new Dl;this.g=new wl(El(this.m,this.v));this.c={};this.c.unknown=this.b;this.c.signInViaRedirect=this.b;this.c.linkViaRedirect=this.b;this.c.reauthViaRedirect=this.b;this.c.signInViaPopup=this.A;this.c.linkViaPopup=this.A;this.c.reauthViaPopup=this.A;this.a=Fl(this.O,this.m,this.v,Ba,this.G);}
    function Fl(a,b,c,d,e){var f=firebase.SDK_VERSION||null;return Be()?new nl(a,b,c,f,d,e):new Uj(a,b,c,f,d,e)}Bl.prototype.reset=function(){this.f=!1;this.a.Ra(this.l);this.a=Fl(this.O,this.m,this.v,null,this.G);this.i={};};function Gl(a){a.f||(a.f=!0,a.a.Ea(a.l));var b=a.a;return a.a.la().s(function(c){a.a==b&&a.reset();throw c;})}
    function Hl(a){a.a.Wb()&&Gl(a).s(function(b){var c=new oh("unknown",null,null,null,new t("operation-not-supported-in-this-environment"));Il(b)&&a.o(c);});a.a.Sb()||Jl(a.b);}function Kl(a,b){Ta(a.h,b)||a.h.push(b);a.f||Al(a.g).then(function(c){c?zl(a.g).then(function(){Gl(a).s(function(d){var e=new oh("unknown",null,null,null,new t("operation-not-supported-in-this-environment"));Il(d)&&a.o(e);});}):Hl(a);}).s(function(){Hl(a);});}function Ll(a,b){Va(a.h,function(c){return c==b});}
    Bl.prototype.o=function(a){if(!a)throw new t("invalid-auth-event");6E5<=ua()-this.u&&(this.i={},this.u=0);if(a&&a.getUid()&&this.i.hasOwnProperty(a.getUid()))return !1;for(var b=!1,c=0;c<this.h.length;c++){var d=this.h[c];if(d.Eb(a.c,a.b)){if(b=this.c[a.c])b.h(a,d),a&&(a.f||a.b)&&(this.i[a.getUid()]=!0,this.u=ua());b=!0;break}}Jl(this.b);return b};var Ml=new Ue(2E3,1E4),Nl=new Ue(3E4,6E4);Bl.prototype.qa=function(){return this.b.qa()};
    function Ol(a,b,c,d,e,f,g){return a.a.Lb(b,c,d,function(){a.f||(a.f=!0,a.a.Ea(a.l));},function(){a.reset();},e,f,g)}function Il(a){return a&&"auth/cordova-not-ready"==a.code?!0:!1}
    function Pl(a,b,c,d,e){var f;return yl(a.g).then(function(){return a.a.Mb(b,c,d,e).s(function(g){if(Il(g))throw new t("operation-not-supported-in-this-environment");f=g;return zl(a.g).then(function(){throw f;})}).then(function(){return a.a.Zb()?new C(function(){}):zl(a.g).then(function(){return a.qa()}).then(function(){}).s(function(){})})})}function Ql(a,b,c,d,e){return a.a.Nb(d,function(f){b.ma(c,null,f,e);},Ml.get())}var Rl={};function El(a,b,c){a=a+":"+b;c&&(a=a+":"+c.url);return a}
    function Sl(a,b,c,d){var e=El(b,c,d);Rl[e]||(Rl[e]=new Bl(a,b,c,d));return Rl[e]}function Cl(){this.b=null;this.f=[];this.c=[];this.a=null;this.i=this.g=!1;}Cl.prototype.reset=function(){this.b=null;this.a&&(this.a.cancel(),this.a=null);};
    Cl.prototype.h=function(a,b){if(a){this.reset();this.g=!0;var c=a.c,d=a.b,e=a.a&&"auth/web-storage-unsupported"==a.a.code,f=a.a&&"auth/operation-not-supported-in-this-environment"==a.a.code;this.i=!(!e&&!f);"unknown"!=c||e||f?a.a?(Tl(this,!0,null,a.a),D()):b.Fa(c,d)?Ul(this,a,b):E(new t("invalid-auth-event")):(Tl(this,!1,null,null),D());}else E(new t("invalid-auth-event"));};function Jl(a){a.g||(a.g=!0,Tl(a,!1,null,null));}function Vl(a){a.g&&!a.i&&Tl(a,!1,null,null);}
    function Ul(a,b,c){c=c.Fa(b.c,b.b);var d=b.g,e=b.f,f=b.i,g=b.S(),h=!!b.c.match(/Redirect$/);c(d,e,g,f).then(function(m){Tl(a,h,m,null);}).s(function(m){Tl(a,h,null,m);});}function Wl(a,b){a.b=function(){return E(b)};if(a.c.length)for(var c=0;c<a.c.length;c++)a.c[c](b);}function Xl(a,b){a.b=function(){return D(b)};if(a.f.length)for(var c=0;c<a.f.length;c++)a.f[c](b);}function Tl(a,b,c,d){b?d?Wl(a,d):Xl(a,c):Xl(a,{user:null});a.f=[];a.c=[];}
    Cl.prototype.qa=function(){var a=this;return new C(function(b,c){a.b?a.b().then(b,c):(a.f.push(b),a.c.push(c),Yl(a));})};function Yl(a){var b=new t("timeout");a.a&&a.a.cancel();a.a=Ad(Nl.get()).then(function(){a.b||(a.g=!0,Tl(a,!0,null,b));});}function Dl(){}Dl.prototype.h=function(a,b){if(a){var c=a.c,d=a.b;a.a?(b.ma(a.c,null,a.a,a.b),D()):b.Fa(c,d)?Zl(a,b):E(new t("invalid-auth-event"));}else E(new t("invalid-auth-event"));};
    function Zl(a,b){var c=a.b,d=a.c;b.Fa(d,c)(a.g,a.f,a.S(),a.i).then(function(e){b.ma(d,e,null,c);}).s(function(e){b.ma(d,null,e,c);});}function $l(){this.hb=!1;Object.defineProperty(this,"appVerificationDisabled",{get:function(){return this.hb},set:function(a){this.hb=a;},enumerable:!1});}function am(a,b){this.a=b;M(this,"verificationId",a);}am.prototype.confirm=function(a){a=lh(this.verificationId,a);return this.a(a)};function bm(a,b,c,d){return (new hh(a)).eb(b,c).then(function(e){return new am(e,d)})}function cm(a){var b=eg(a);if(!(b&&b.exp&&b.auth_time&&b.iat))throw new t("internal-error","An internal error occurred. The token obtained by Firebase appears to be malformed. Please retry the operation.");N(this,{token:a,expirationTime:Ye(1E3*b.exp),authTime:Ye(1E3*b.auth_time),issuedAtTime:Ye(1E3*b.iat),signInProvider:b.firebase&&b.firebase.sign_in_provider?b.firebase.sign_in_provider:null,signInSecondFactor:b.firebase&&b.firebase.sign_in_second_factor?b.firebase.sign_in_second_factor:null,claims:b});}
    function dm(a,b,c){var d=b&&b[em];if(!d)throw new t("argument-error","Internal assert: Invalid MultiFactorResolver");this.a=a;this.f=lb(b);this.g=c;this.c=new ug(null,d);this.b=[];var e=this;w(b[fm]||[],function(f){(f=pf(f))&&e.b.push(f);});M(this,"auth",this.a);M(this,"session",this.c);M(this,"hints",this.b);}var fm="mfaInfo",em="mfaPendingCredential";dm.prototype.Qc=function(a){var b=this;return a.rb(this.a.a,this.c).then(function(c){var d=lb(b.f);delete d[fm];delete d[em];z(d,c);return b.g(d)})};function gm(a,b,c,d){t.call(this,"multi-factor-auth-required",d,b);this.b=new dm(a,b,c);M(this,"resolver",this.b);}r(gm,t);function hm(a,b,c){if(a&&n(a.serverResponse)&&"auth/multi-factor-auth-required"===a.code)try{return new gm(b,a.serverResponse,c,a.message)}catch(d){}return null}function im(){}im.prototype.rb=function(a,b,c){return b.type==vg?jm(this,a,b,c):km(this,a,b)};function jm(a,b,c,d){return c.Ha().then(function(e){e={idToken:e};"undefined"!==typeof d&&(e.displayName=d);z(e,{phoneVerificationInfo:dh(a.a)});return O(b,Cj,e)})}function km(a,b,c){return c.Ha().then(function(d){d={mfaPendingCredential:d};z(d,{phoneVerificationInfo:dh(a.a)});return O(b,Dj,d)})}function lm(a){M(this,"factorId",a.fa);this.a=a;}r(lm,im);
    function mm(a){lm.call(this,a);if(this.a.fa!=hh.PROVIDER_ID)throw new t("argument-error","firebase.auth.PhoneMultiFactorAssertion requires a valid firebase.auth.PhoneAuthCredential");}r(mm,lm);function nm(a,b){F.call(this,a);for(var c in b)this[c]=b[c];}r(nm,F);function om(a,b){this.a=a;this.b=[];this.c=q(this.xc,this);jd(this.a,"userReloaded",this.c);var c=[];b&&b.multiFactor&&b.multiFactor.enrolledFactors&&w(b.multiFactor.enrolledFactors,function(d){var e=null,f={};if(d){d.uid&&(f[mf]=d.uid);d.displayName&&(f[nf]=d.displayName);d.enrollmentTime&&(f[of]=(new Date(d.enrollmentTime)).toISOString());d.phoneNumber&&(f[lf]=d.phoneNumber);try{e=new qf(f);}catch(g){}d=e;}else d=null;d&&c.push(d);});pm(this,c);}
    function qm(a){var b=[];w(a.mfaInfo||[],function(c){(c=pf(c))&&b.push(c);});return b}k=om.prototype;k.xc=function(a){pm(this,qm(a.gd));};function pm(a,b){a.b=b;M(a,"enrolledFactors",b);}k.Qb=function(){return this.a.I().then(function(a){return new ug(a,null)})};k.ec=function(a,b){var c=this,d=this.a.a;return this.Qb().then(function(e){return a.rb(d,e,b)}).then(function(e){rm(c.a,e);return c.a.reload()})};
    k.ad=function(a){var b=this,c="string"===typeof a?a:a.uid,d=this.a.a;return this.a.I().then(function(e){return O(d,Hj,{idToken:e,mfaEnrollmentId:c})}).then(function(e){var f=Oa(b.b,function(g){return g.uid!=c});pm(b,f);rm(b.a,e);return b.a.reload().s(function(g){if("auth/user-token-expired"!=g.code)throw g;})})};k.w=function(){return {multiFactor:{enrolledFactors:Pa(this.b,function(a){return a.w()})}}};function sm(a,b,c){this.h=a;this.i=b;this.g=c;this.c=3E4;this.f=96E4;this.b=null;this.a=this.c;if(this.f<this.c)throw Error("Proactive refresh lower bound greater than upper bound!");}sm.prototype.start=function(){this.a=this.c;tm(this,!0);};function um(a,b){if(b)return a.a=a.c,a.g();b=a.a;a.a*=2;a.a>a.f&&(a.a=a.f);return b}function tm(a,b){a.stop();a.b=Ad(um(a,b)).then(function(){return We()}).then(function(){return a.h()}).then(function(){tm(a,!0);}).s(function(c){a.i(c)&&tm(a,!1);});}
    sm.prototype.stop=function(){this.b&&(this.b.cancel(),this.b=null);};function vm(a){this.c=a;this.b=this.a=null;}vm.prototype.w=function(){return {apiKey:this.c.c,refreshToken:this.a,accessToken:this.b&&this.b.toString(),expirationTime:wm(this)}};function wm(a){return a.b&&1E3*a.b.c||0}function xm(a,b){var c=b.refreshToken;a.b=fg(b[zg]||"");a.a=c;}function ym(a,b){a.b=b.b;a.a=b.a;}
    function zm(a,b){return Si(a.c,b).then(function(c){a.b=fg(c.access_token);a.a=c.refresh_token;return {accessToken:a.b.toString(),refreshToken:a.a}}).s(function(c){"auth/user-token-expired"==c.code&&(a.a=null);throw c;})}vm.prototype.getToken=function(a){a=!!a;return this.b&&!this.a?E(new t("user-token-expired")):a||!this.b||ua()>wm(this)-3E4?this.a?zm(this,{grant_type:"refresh_token",refresh_token:this.a}):D(null):D({accessToken:this.b.toString(),refreshToken:this.a})};function Am(a,b){this.a=a||null;this.b=b||null;N(this,{lastSignInTime:Ye(b||null),creationTime:Ye(a||null)});}function Bm(a){return new Am(a.a,a.b)}Am.prototype.w=function(){return {lastLoginAt:this.b,createdAt:this.a}};function Cm(a,b,c,d,e,f){N(this,{uid:a,displayName:d||null,photoURL:e||null,email:c||null,phoneNumber:f||null,providerId:b});}
    function Dm(a,b,c){this.G=[];this.l=a.apiKey;this.m=a.appName;this.o=a.authDomain||null;var d=firebase.SDK_VERSION?Je(firebase.SDK_VERSION):null;this.a=new Ei(this.l,Aa(Ba),d);a.emulatorConfig&&Li(this.a,a.emulatorConfig);this.b=new vm(this.a);Em(this,b[zg]);xm(this.b,b);M(this,"refreshToken",this.b.a);Fm(this,c||{});H.call(this);this.P=!1;this.o&&Me()&&(this.i=Sl(this.o,this.l,this.m));this.R=[];this.f=null;this.u=Gm(this);this.$=q(this.gb,this);var e=this;this.pa=null;this.Ba=function(f){e.wa(f.h);};
    this.ba=null;this.za=function(f){Li(e.a,f.c);};this.W=null;this.X=[];this.Aa=function(f){Hm(e,f.f);};this.aa=null;this.N=new om(this,c);M(this,"multiFactor",this.N);}r(Dm,H);Dm.prototype.wa=function(a){this.pa=a;Ki(this.a,a);};Dm.prototype.ka=function(){return this.pa};function Im(a,b){a.ba&&G(a.ba,"languageCodeChanged",a.Ba);(a.ba=b)&&jd(b,"languageCodeChanged",a.Ba);}function Jm(a,b){a.W&&G(a.W,"emulatorConfigChanged",a.za);(a.W=b)&&jd(b,"emulatorConfigChanged",a.za);}
    function Hm(a,b){a.X=b;Ni(a.a,firebase.SDK_VERSION?Je(firebase.SDK_VERSION,a.X):null);}Dm.prototype.Ga=function(){return Xa(this.X)};function Km(a,b){a.aa&&G(a.aa,"frameworkChanged",a.Aa);(a.aa=b)&&jd(b,"frameworkChanged",a.Aa);}Dm.prototype.gb=function(){this.u.b&&(this.u.stop(),this.u.start());};function Lm(a){try{return firebase.app(a.m).auth()}catch(b){throw new t("internal-error","No firebase.auth.Auth instance is available for the Firebase App '"+a.m+"'!");}}
    function Gm(a){return new sm(function(){return a.I(!0)},function(b){return b&&"auth/network-request-failed"==b.code?!0:!1},function(){var b=wm(a.b)-ua()-3E5;return 0<b?b:0})}function Mm(a){a.A||a.u.b||(a.u.start(),G(a,"tokenChanged",a.$),jd(a,"tokenChanged",a.$));}function Nm(a){G(a,"tokenChanged",a.$);a.u.stop();}function Em(a,b){a.ya=b;M(a,"_lat",b);}function Om(a,b){Va(a.R,function(c){return c==b});}
    function Pm(a){for(var b=[],c=0;c<a.R.length;c++)b.push(a.R[c](a));return Fc(b).then(function(){return a})}function Qm(a){a.i&&!a.P&&(a.P=!0,Kl(a.i,a));}function Fm(a,b){N(a,{uid:b.uid,displayName:b.displayName||null,photoURL:b.photoURL||null,email:b.email||null,emailVerified:b.emailVerified||!1,phoneNumber:b.phoneNumber||null,isAnonymous:b.isAnonymous||!1,tenantId:b.tenantId||null,metadata:new Am(b.createdAt,b.lastLoginAt),providerData:[]});a.a.b=a.tenantId;}M(Dm.prototype,"providerId","firebase");
    function Rm(){}function Sm(a){return D().then(function(){if(a.A)throw new t("app-deleted");})}function Tm(a){return Pa(a.providerData,function(b){return b.providerId})}function Um(a,b){b&&(Vm(a,b.providerId),a.providerData.push(b));}function Vm(a,b){Va(a.providerData,function(c){return c.providerId==b});}function Wm(a,b,c){("uid"!=b||c)&&a.hasOwnProperty(b)&&M(a,b,c);}
    function Xm(a,b){a!=b&&(N(a,{uid:b.uid,displayName:b.displayName,photoURL:b.photoURL,email:b.email,emailVerified:b.emailVerified,phoneNumber:b.phoneNumber,isAnonymous:b.isAnonymous,tenantId:b.tenantId,providerData:[]}),b.metadata?M(a,"metadata",Bm(b.metadata)):M(a,"metadata",new Am),w(b.providerData,function(c){Um(a,c);}),ym(a.b,b.b),M(a,"refreshToken",a.b.a),pm(a.N,b.N.b));}k=Dm.prototype;k.reload=function(){var a=this;return R(this,Sm(this).then(function(){return Ym(a).then(function(){return Pm(a)}).then(Rm)}))};
    function Ym(a){return a.I().then(function(b){var c=a.isAnonymous;return Zm(a,b).then(function(){c||Wm(a,"isAnonymous",!1);return b})})}k.nc=function(a){return this.I(a).then(function(b){return new cm(b)})};k.I=function(a){var b=this;return R(this,Sm(this).then(function(){return b.b.getToken(a)}).then(function(c){if(!c)throw new t("internal-error");c.accessToken!=b.ya&&(Em(b,c.accessToken),b.dispatchEvent(new nm("tokenChanged")));Wm(b,"refreshToken",c.refreshToken);return c.accessToken}))};
    function rm(a,b){b[zg]&&a.ya!=b[zg]&&(xm(a.b,b),a.dispatchEvent(new nm("tokenChanged")),Em(a,b[zg]),Wm(a,"refreshToken",a.b.a));}function Zm(a,b){return O(a.a,Ej,{idToken:b}).then(q(a.Jc,a))}
    k.Jc=function(a){a=a.users;if(!a||!a.length)throw new t("internal-error");a=a[0];Fm(this,{uid:a.localId,displayName:a.displayName,photoURL:a.photoUrl,email:a.email,emailVerified:!!a.emailVerified,phoneNumber:a.phoneNumber,lastLoginAt:a.lastLoginAt,createdAt:a.createdAt,tenantId:a.tenantId});for(var b=$m(a),c=0;c<b.length;c++)Um(this,b[c]);Wm(this,"isAnonymous",!(this.email&&a.passwordHash)&&!(this.providerData&&this.providerData.length));this.dispatchEvent(new nm("userReloaded",{gd:a}));};
    function $m(a){return (a=a.providerUserInfo)&&a.length?Pa(a,function(b){return new Cm(b.rawId,b.providerId,b.email,b.displayName,b.photoUrl,b.phoneNumber)}):[]}k.Kc=function(a){cf("firebase.User.prototype.reauthenticateAndRetrieveDataWithCredential is deprecated. Please use firebase.User.prototype.reauthenticateWithCredential instead.");return this.sb(a)};
    k.sb=function(a){var b=this,c=null;return R(this,a.c(this.a,this.uid).then(function(d){rm(b,d);c=an(b,d,"reauthenticate");b.f=null;return b.reload()}).then(function(){return c}),!0)};function bn(a,b){return Ym(a).then(function(){if(Ta(Tm(a),b))return Pm(a).then(function(){throw new t("provider-already-linked");})})}k.Bc=function(a){cf("firebase.User.prototype.linkAndRetrieveDataWithCredential is deprecated. Please use firebase.User.prototype.linkWithCredential instead.");return this.pb(a)};
    k.pb=function(a){var b=this,c=null;return R(this,bn(this,a.providerId).then(function(){return b.I()}).then(function(d){return a.b(b.a,d)}).then(function(d){c=an(b,d,"link");return cn(b,d)}).then(function(){return c}))};k.Cc=function(a,b){var c=this;return R(this,bn(this,"phone").then(function(){return bm(Lm(c),a,b,q(c.pb,c))}))};k.Lc=function(a,b){var c=this;return R(this,D().then(function(){return bm(Lm(c),a,b,q(c.sb,c))}),!0)};
    function an(a,b,c){var d=mh(b);b=kg(b);return ff({user:a,credential:d,additionalUserInfo:b,operationType:c})}function cn(a,b){rm(a,b);return a.reload().then(function(){return a})}k.Ab=function(a){var b=this;return R(this,this.I().then(function(c){return b.a.Ab(c,a)}).then(function(c){rm(b,c);return b.reload()}))};k.dd=function(a){var b=this;return R(this,this.I().then(function(c){return a.b(b.a,c)}).then(function(c){rm(b,c);return b.reload()}))};
    k.Bb=function(a){var b=this;return R(this,this.I().then(function(c){return b.a.Bb(c,a)}).then(function(c){rm(b,c);return b.reload()}))};
    k.Cb=function(a){if(void 0===a.displayName&&void 0===a.photoURL)return Sm(this);var b=this;return R(this,this.I().then(function(c){return b.a.Cb(c,{displayName:a.displayName,photoUrl:a.photoURL})}).then(function(c){rm(b,c);Wm(b,"displayName",c.displayName||null);Wm(b,"photoURL",c.photoUrl||null);w(b.providerData,function(d){"password"===d.providerId&&(M(d,"displayName",b.displayName),M(d,"photoURL",b.photoURL));});return Pm(b)}).then(Rm))};
    k.bd=function(a){var b=this;return R(this,Ym(this).then(function(c){return Ta(Tm(b),a)?nj(b.a,c,[a]).then(function(d){var e={};w(d.providerUserInfo||[],function(f){e[f.providerId]=!0;});w(Tm(b),function(f){e[f]||Vm(b,f);});e[hh.PROVIDER_ID]||M(b,"phoneNumber",null);return Pm(b)}):Pm(b).then(function(){throw new t("no-such-provider");})}))};
    k.delete=function(){var a=this;return R(this,this.I().then(function(b){return O(a.a,Bj,{idToken:b})}).then(function(){a.dispatchEvent(new nm("userDeleted"));})).then(function(){for(var b=0;b<a.G.length;b++)a.G[b].cancel("app-deleted");Im(a,null);Jm(a,null);Km(a,null);a.G=[];a.A=!0;Nm(a);M(a,"refreshToken",null);a.i&&Ll(a.i,a);})};
    k.Eb=function(a,b){return "linkViaPopup"==a&&(this.h||null)==b&&this.g||"reauthViaPopup"==a&&(this.h||null)==b&&this.g||"linkViaRedirect"==a&&(this.ga||null)==b||"reauthViaRedirect"==a&&(this.ga||null)==b?!0:!1};k.ma=function(a,b,c,d){"linkViaPopup"!=a&&"reauthViaPopup"!=a||d!=(this.h||null)||(c&&this.O?this.O(c):b&&!c&&this.g&&this.g(b),this.c&&(this.c.cancel(),this.c=null),delete this.g,delete this.O);};
    k.Fa=function(a,b){return "linkViaPopup"==a&&b==(this.h||null)?q(this.Jb,this):"reauthViaPopup"==a&&b==(this.h||null)?q(this.Kb,this):"linkViaRedirect"==a&&(this.ga||null)==b?q(this.Jb,this):"reauthViaRedirect"==a&&(this.ga||null)==b?q(this.Kb,this):null};k.Dc=function(a){var b=this;return dn(this,"linkViaPopup",a,function(){return bn(b,a.providerId).then(function(){return Pm(b)})},!1)};k.Mc=function(a){return dn(this,"reauthViaPopup",a,function(){return D()},!0)};
    function dn(a,b,c,d,e){if(!Me())return E(new t("operation-not-supported-in-this-environment"));if(a.f&&!e)return E(a.f);var f=jg(c.providerId),g=Le(a.uid+":::"),h=null;(!Oe()||De())&&a.o&&c.isOAuthProvider&&(h=ak(a.o,a.l,a.m,b,c,null,g,firebase.SDK_VERSION||null,null,null,a.tenantId));var m=ue(h,f&&f.ua,f&&f.ta);d=d().then(function(){en(a);if(!e)return a.I().then(function(){})}).then(function(){return Ol(a.i,m,b,c,g,!!h,a.tenantId)}).then(function(){return new C(function(p,v){a.ma(b,null,new t("cancelled-popup-request"),
    a.h||null);a.g=p;a.O=v;a.h=g;a.c=Ql(a.i,a,b,m,g);})}).then(function(p){m&&te(m);return p?ff(p):null}).s(function(p){m&&te(m);throw p;});return R(a,d,e)}k.Ec=function(a){var b=this;return fn(this,"linkViaRedirect",a,function(){return bn(b,a.providerId)},!1)};k.Nc=function(a){return fn(this,"reauthViaRedirect",a,function(){return D()},!0)};
    function fn(a,b,c,d,e){if(!Me())return E(new t("operation-not-supported-in-this-environment"));if(a.f&&!e)return E(a.f);var f=null,g=Le(a.uid+":::");d=d().then(function(){en(a);if(!e)return a.I().then(function(){})}).then(function(){a.ga=g;return Pm(a)}).then(function(h){a.ha&&(h=a.ha,h=h.b.set(gn,a.w(),h.a));return h}).then(function(){return Pl(a.i,b,c,g,a.tenantId)}).s(function(h){f=h;if(a.ha)return hn(a.ha);throw f;}).then(function(){if(f)throw f;});return R(a,d,e)}
    function en(a){if(!a.i||!a.P){if(a.i&&!a.P)throw new t("internal-error");throw new t("auth-domain-config-required");}}k.Jb=function(a,b,c,d){var e=this;this.c&&(this.c.cancel(),this.c=null);var f=null;c=this.I().then(function(g){return Dg(e.a,{requestUri:a,postBody:d,sessionId:b,idToken:g})}).then(function(g){f=an(e,g,"link");return cn(e,g)}).then(function(){return f});return R(this,c)};
    k.Kb=function(a,b,c,d){var e=this;this.c&&(this.c.cancel(),this.c=null);var f=null,g=D().then(function(){return yg(Eg(e.a,{requestUri:a,sessionId:b,postBody:d,tenantId:c}),e.uid)}).then(function(h){f=an(e,h,"reauthenticate");rm(e,h);e.f=null;return e.reload()}).then(function(){return f});return R(this,g,!0)};
    k.tb=function(a){var b=this,c=null;return R(this,this.I().then(function(d){c=d;return "undefined"===typeof a||kb(a)?{}:Yf(new Of(a))}).then(function(d){return b.a.tb(c,d)}).then(function(d){if(b.email!=d)return b.reload()}).then(function(){}))};k.Db=function(a,b){var c=this,d=null;return R(this,this.I().then(function(e){d=e;return "undefined"===typeof b||kb(b)?{}:Yf(new Of(b))}).then(function(e){return c.a.Db(d,a,e)}).then(function(e){if(c.email!=e)return c.reload()}).then(function(){}))};
    function R(a,b,c){var d=jn(a,b,c);a.G.push(d);d.na(function(){Ua(a.G,d);});return d.s(function(e){var f=null;e&&"auth/multi-factor-auth-required"===e.code&&(f=hm(e.w(),Lm(a),q(a.ic,a)));throw f||e;})}k.ic=function(a){var b=null,c=this;a=yg(D(a),c.uid).then(function(d){b=an(c,d,"reauthenticate");rm(c,d);c.f=null;return c.reload()}).then(function(){return b});return R(this,a,!0)};
    function jn(a,b,c){return a.f&&!c?(b.cancel(),E(a.f)):b.s(function(d){!d||"auth/user-disabled"!=d.code&&"auth/user-token-expired"!=d.code||(a.f||a.dispatchEvent(new nm("userInvalidated")),a.f=d);throw d;})}k.toJSON=function(){return this.w()};
    k.w=function(){var a={uid:this.uid,displayName:this.displayName,photoURL:this.photoURL,email:this.email,emailVerified:this.emailVerified,phoneNumber:this.phoneNumber,isAnonymous:this.isAnonymous,tenantId:this.tenantId,providerData:[],apiKey:this.l,appName:this.m,authDomain:this.o,stsTokenManager:this.b.w(),redirectEventId:this.ga||null};this.metadata&&z(a,this.metadata.w());w(this.providerData,function(b){a.providerData.push(gf(b));});z(a,this.N.w());return a};
    function kn(a){if(!a.apiKey)return null;var b={apiKey:a.apiKey,authDomain:a.authDomain,appName:a.appName,emulatorConfig:a.emulatorConfig},c={};if(a.stsTokenManager&&a.stsTokenManager.accessToken)c[zg]=a.stsTokenManager.accessToken,c.refreshToken=a.stsTokenManager.refreshToken||null;else return null;var d=new Dm(b,c,a);a.providerData&&w(a.providerData,function(e){e&&Um(d,ff(e));});a.redirectEventId&&(d.ga=a.redirectEventId);return d}
    function ln(a,b,c,d){var e=new Dm(a,b);c&&(e.ha=c);d&&Hm(e,d);return e.reload().then(function(){return e})}function mn(a,b,c,d){var e=a.b,f={};f[zg]=e.b&&e.b.toString();f.refreshToken=e.a;b=new Dm(b||{apiKey:a.l,authDomain:a.o,appName:a.m},f);c&&(b.ha=c);d&&Hm(b,d);Xm(b,a);return b}function nn(a){this.a=a;this.b=Qk();}var gn={name:"redirectUser",D:"session"};function hn(a){return Uk(a.b,gn,a.a)}function on(a,b){return a.b.get(gn,a.a).then(function(c){c&&b&&(c.authDomain=b);return kn(c||{})})}function pn(a){this.a=a;this.b=Qk();this.c=null;this.f=qn(this);this.b.addListener(rn("local"),this.a,q(this.g,this));}pn.prototype.g=function(){var a=this,b=rn("local");sn(this,function(){return D().then(function(){return a.c&&"local"!=a.c.D?a.b.get(b,a.a):null}).then(function(c){if(c)return tn(a,"local").then(function(){a.c=b;})})});};function tn(a,b){var c=[],d;for(d in Mk)Mk[d]!==b&&c.push(Uk(a.b,rn(Mk[d]),a.a));c.push(Uk(a.b,un,a.a));return Ec(c)}
    function qn(a){var b=rn("local"),c=rn("session"),d=rn("none");return Tk(a.b,b,a.a).then(function(){return a.b.get(c,a.a)}).then(function(e){return e?c:a.b.get(d,a.a).then(function(f){return f?d:a.b.get(b,a.a).then(function(g){return g?b:a.b.get(un,a.a).then(function(h){return h?rn(h):b})})})}).then(function(e){a.c=e;return tn(a,e.D)}).s(function(){a.c||(a.c=b);})}var un={name:"persistence",D:"session"};function rn(a){return {name:"authUser",D:a}}
    pn.prototype.wb=function(a){var b=null,c=this;Nk(a);return sn(this,function(){return a!=c.c.D?c.b.get(c.c,c.a).then(function(d){b=d;return tn(c,a)}).then(function(){c.c=rn(a);if(b)return c.b.set(c.c,b,c.a)}):D()})};function vn(a){return sn(a,function(){return a.b.set(un,a.c.D,a.a)})}function wn(a,b){return sn(a,function(){return a.b.set(a.c,b.w(),a.a)})}function xn(a){return sn(a,function(){return Uk(a.b,a.c,a.a)})}
    function yn(a,b,c){return sn(a,function(){return a.b.get(a.c,a.a).then(function(d){d&&b&&(d.authDomain=b);d&&c&&(d.emulatorConfig=c);return kn(d||{})})})}function sn(a,b){a.f=a.f.then(b,b);return a.f}function zn(a){this.m=!1;M(this,"settings",new $l);M(this,"app",a);if(S(this).options&&S(this).options.apiKey)a=firebase.SDK_VERSION?Je(firebase.SDK_VERSION):null,this.a=new Ei(S(this).options&&S(this).options.apiKey,Aa(Ba),a);else throw new t("invalid-api-key");this.R=[];this.u=[];this.P=[];this.ac=firebase.INTERNAL.createSubscribe(q(this.yc,this));this.X=void 0;this.bc=firebase.INTERNAL.createSubscribe(q(this.zc,this));An(this,null);this.l=new pn(S(this).options.apiKey+":"+S(this).name);this.G=
    new nn(S(this).options.apiKey+":"+S(this).name);this.$=T(this,Bn(this));this.i=T(this,Cn(this));this.ba=!1;this.pa=q(this.Yc,this);this.Ba=q(this.da,this);this.ya=q(this.kc,this);this.za=q(this.vc,this);this.Aa=q(this.wc,this);this.b=null;Dn(this);this.INTERNAL={};this.INTERNAL["delete"]=q(this.delete,this);this.INTERNAL.logFramework=q(this.Fc,this);this.A=0;H.call(this);En(this);this.N=[];this.f=null;}r(zn,H);function Fn(a){F.call(this,"languageCodeChanged");this.h=a;}r(Fn,F);
    function Gn(a){F.call(this,"emulatorConfigChanged");this.c=a;}r(Gn,F);function Hn(a){F.call(this,"frameworkChanged");this.f=a;}r(Hn,F);k=zn.prototype;k.wb=function(a){a=this.l.wb(a);return T(this,a)};k.wa=function(a){this.aa===a||this.m||(this.aa=a,Ki(this.a,this.aa),this.dispatchEvent(new Fn(this.ka())));};k.ka=function(){return this.aa};k.ed=function(){var a=l.navigator;this.wa(a?a.languages&&a.languages[0]||a.language||a.userLanguage||null:null);};
    k.fd=function(a){if(!this.f){if(!/^https?:\/\//.test(a))throw new t("argument-error","Emulator URL must start with a valid scheme (http:// or https://).");In();this.f={url:a};this.settings.hb=!0;Li(this.a,this.f);this.dispatchEvent(new Gn(this.f));}};
    function In(){Xe("WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.");l.document&&ze().then(function(){var a=l.document.createElement("div");a.innerText="Running in emulator mode. Do not use with production credentials.";a.style.position="fixed";a.style.width="100%";a.style.backgroundColor="#ffffff";a.style.border=".1em solid #000000";a.style.color="#ff0000";a.style.bottom="0px";a.style.left="0px";a.style.margin="0px";a.style.zIndex=
    1E4;a.style.textAlign="center";a.classList.add("firebase-emulator-warning");l.document.body.appendChild(a);});}k.Fc=function(a){this.N.push(a);Ni(this.a,firebase.SDK_VERSION?Je(firebase.SDK_VERSION,this.N):null);this.dispatchEvent(new Hn(this.N));};k.Ga=function(){return Xa(this.N)};k.xb=function(a){this.W===a||this.m||(this.W=a,this.a.b=this.W);};k.S=function(){return this.W};
    function En(a){Object.defineProperty(a,"lc",{get:function(){return this.ka()},set:function(b){this.wa(b);},enumerable:!1});a.aa=null;Object.defineProperty(a,"ti",{get:function(){return this.S()},set:function(b){this.xb(b);},enumerable:!1});a.W=null;}k.toJSON=function(){return {apiKey:S(this).options.apiKey,authDomain:S(this).options.authDomain,appName:S(this).name,currentUser:U(this)&&U(this).w()}};function Jn(a){return a.gb||E(new t("auth-domain-config-required"))}
    function Dn(a){var b=S(a).options.authDomain,c=S(a).options.apiKey;b&&Me()&&(a.gb=a.$.then(function(){if(!a.m){a.b=Sl(b,c,S(a).name,a.f);Kl(a.b,a);U(a)&&Qm(U(a));if(a.o){Qm(a.o);var d=a.o;d.wa(a.ka());Im(d,a);d=a.o;Hm(d,a.N);Km(d,a);d=a.o;Li(d.a,a.f);Jm(d,a);a.o=null;}return a.b}}));}k.Eb=function(a,b){switch(a){case "unknown":case "signInViaRedirect":return !0;case "signInViaPopup":return this.h==b&&!!this.g;default:return !1}};
    k.ma=function(a,b,c,d){"signInViaPopup"==a&&this.h==d&&(c&&this.O?this.O(c):b&&!c&&this.g&&this.g(b),this.c&&(this.c.cancel(),this.c=null),delete this.g,delete this.O);};k.Fa=function(a,b){return "signInViaRedirect"==a||"signInViaPopup"==a&&this.h==b&&this.g?q(this.hc,this):null};k.hc=function(a,b,c,d){var e=this,f={requestUri:a,postBody:d,sessionId:b,tenantId:c};this.c&&(this.c.cancel(),this.c=null);return e.$.then(function(){return Kn(e,Bg(e.a,f))})};
    k.Wc=function(a){if(!Me())return E(new t("operation-not-supported-in-this-environment"));var b=this,c=jg(a.providerId),d=Le(),e=null;(!Oe()||De())&&S(this).options.authDomain&&a.isOAuthProvider&&(e=ak(S(this).options.authDomain,S(this).options.apiKey,S(this).name,"signInViaPopup",a,null,d,firebase.SDK_VERSION||null,null,null,this.S(),this.f));var f=ue(e,c&&c.ua,c&&c.ta);c=Jn(this).then(function(g){return Ol(g,f,"signInViaPopup",a,d,!!e,b.S())}).then(function(){return new C(function(g,h){b.ma("signInViaPopup",
    null,new t("cancelled-popup-request"),b.h);b.g=g;b.O=h;b.h=d;b.c=Ql(b.b,b,"signInViaPopup",f,d);})}).then(function(g){f&&te(f);return g?ff(g):null}).s(function(g){f&&te(f);throw g;});return T(this,c)};k.Xc=function(a){if(!Me())return E(new t("operation-not-supported-in-this-environment"));var b=this,c=Jn(this).then(function(){return vn(b.l)}).then(function(){return Pl(b.b,"signInViaRedirect",a,void 0,b.S())});return T(this,c)};
    function Ln(a){if(!Me())return E(new t("operation-not-supported-in-this-environment"));var b=Jn(a).then(function(){return a.b.qa()}).then(function(c){return c?ff(c):null});return T(a,b)}k.qa=function(){var a=this;return Ln(this).then(function(b){a.b&&Vl(a.b.b);return b}).s(function(b){a.b&&Vl(a.b.b);throw b;})};
    k.cd=function(a){if(!a)return E(new t("null-user"));if(this.W!=a.tenantId)return E(new t("tenant-id-mismatch"));var b=this,c={};c.apiKey=S(this).options.apiKey;c.authDomain=S(this).options.authDomain;c.appName=S(this).name;var d=mn(a,c,b.G,b.Ga());return T(this,this.i.then(function(){if(S(b).options.apiKey!=a.l)return d.reload()}).then(function(){if(U(b)&&a.uid==U(b).uid)return Xm(U(b),a),b.da(a);An(b,d);Qm(d);return b.da(d)}).then(function(){Mn(b);}))};
    function Nn(a,b){var c={};c.apiKey=S(a).options.apiKey;c.authDomain=S(a).options.authDomain;c.appName=S(a).name;a.f&&(c.emulatorConfig=a.f);return a.$.then(function(){return ln(c,b,a.G,a.Ga())}).then(function(d){if(U(a)&&d.uid==U(a).uid)return Xm(U(a),d),a.da(d);An(a,d);Qm(d);return a.da(d)}).then(function(){Mn(a);})}
    function An(a,b){U(a)&&(Om(U(a),a.Ba),G(U(a),"tokenChanged",a.ya),G(U(a),"userDeleted",a.za),G(U(a),"userInvalidated",a.Aa),Nm(U(a)));b&&(b.R.push(a.Ba),jd(b,"tokenChanged",a.ya),jd(b,"userDeleted",a.za),jd(b,"userInvalidated",a.Aa),0<a.A&&Mm(b));M(a,"currentUser",b);b&&(b.wa(a.ka()),Im(b,a),Hm(b,a.N),Km(b,a),Li(b.a,a.f),Jm(b,a));}k.zb=function(){var a=this,b=this.i.then(function(){a.b&&Vl(a.b.b);if(!U(a))return D();An(a,null);return xn(a.l).then(function(){Mn(a);})});return T(this,b)};
    function On(a){var b=on(a.G,S(a).options.authDomain).then(function(c){if(a.o=c)c.ha=a.G;return hn(a.G)});return T(a,b)}function Bn(a){var b=S(a).options.authDomain,c=On(a).then(function(){return yn(a.l,b,a.f)}).then(function(d){return d?(d.ha=a.G,a.o&&(a.o.ga||null)==(d.ga||null)?d:d.reload().then(function(){return wn(a.l,d).then(function(){return d})}).s(function(e){return "auth/network-request-failed"==e.code?d:xn(a.l)})):null}).then(function(d){An(a,d||null);});return T(a,c)}
    function Cn(a){return a.$.then(function(){return Ln(a)}).s(function(){}).then(function(){if(!a.m)return a.pa()}).s(function(){}).then(function(){if(!a.m){a.ba=!0;var b=a.l;b.b.addListener(rn("local"),b.a,a.pa);}})}
    k.Yc=function(){var a=this;return yn(this.l,S(this).options.authDomain).then(function(b){if(!a.m){var c;if(c=U(a)&&b){c=U(a).uid;var d=b.uid;c=void 0===c||null===c||""===c||void 0===d||null===d||""===d?!1:c==d;}if(c)return Xm(U(a),b),U(a).I();if(U(a)||b)An(a,b),b&&(Qm(b),b.ha=a.G),a.b&&Kl(a.b,a),Mn(a);}})};k.da=function(a){return wn(this.l,a)};k.kc=function(){Mn(this);this.da(U(this));};k.vc=function(){this.zb();};k.wc=function(){this.zb();};
    function Kn(a,b){var c=null,d=null;return T(a,b.then(function(e){c=mh(e);d=kg(e);return Nn(a,e)},function(e){var f=null;e&&"auth/multi-factor-auth-required"===e.code&&(f=hm(e.w(),a,q(a.jc,a)));throw f||e;}).then(function(){return ff({user:U(a),credential:c,additionalUserInfo:d,operationType:"signIn"})}))}k.jc=function(a){var b=this;return this.i.then(function(){return Kn(b,D(a))})};k.yc=function(a){var b=this;this.addAuthTokenListener(function(){a.next(U(b));});};
    k.zc=function(a){var b=this;Pn(this,function(){a.next(U(b));});};k.Hc=function(a,b,c){var d=this;this.ba&&Promise.resolve().then(function(){"function"===typeof a?a(U(d)):"function"===typeof a.next&&a.next(U(d));});return this.ac(a,b,c)};k.Gc=function(a,b,c){var d=this;this.ba&&Promise.resolve().then(function(){d.X=d.getUid();"function"===typeof a?a(U(d)):"function"===typeof a.next&&a.next(U(d));});return this.bc(a,b,c)};
    k.mc=function(a){var b=this,c=this.i.then(function(){return U(b)?U(b).I(a).then(function(d){return {accessToken:d}}):null});return T(this,c)};k.Sc=function(a){var b=this;return this.i.then(function(){return Kn(b,O(b.a,Gj,{token:a}))}).then(function(c){var d=c.user;Wm(d,"isAnonymous",!1);b.da(d);return c})};k.Tc=function(a,b){var c=this;return this.i.then(function(){return Kn(c,O(c.a,Xg,{email:a,password:b}))})};
    k.dc=function(a,b){var c=this;return this.i.then(function(){return Kn(c,O(c.a,Aj,{email:a,password:b}))})};k.Za=function(a){var b=this;return this.i.then(function(){return Kn(b,a.ja(b.a))})};k.Rc=function(a){cf("firebase.auth.Auth.prototype.signInAndRetrieveDataWithCredential is deprecated. Please use firebase.auth.Auth.prototype.signInWithCredential instead.");return this.Za(a)};
    k.yb=function(){var a=this;return this.i.then(function(){var b=U(a);if(b&&b.isAnonymous){var c=ff({providerId:null,isNewUser:!1});return ff({user:b,credential:null,additionalUserInfo:c,operationType:"signIn"})}return Kn(a,a.a.yb()).then(function(d){var e=d.user;Wm(e,"isAnonymous",!0);a.da(e);return d})})};function S(a){return a.app}function U(a){return a.currentUser}k.getUid=function(){return U(this)&&U(this).uid||null};function Qn(a){return U(a)&&U(a)._lat||null}
    function Mn(a){if(a.ba){for(var b=0;b<a.u.length;b++)if(a.u[b])a.u[b](Qn(a));if(a.X!==a.getUid()&&a.P.length)for(a.X=a.getUid(),b=0;b<a.P.length;b++)if(a.P[b])a.P[b](Qn(a));}}k.cc=function(a){this.addAuthTokenListener(a);this.A++;0<this.A&&U(this)&&Mm(U(this));};k.Oc=function(a){var b=this;w(this.u,function(c){c==a&&b.A--;});0>this.A&&(this.A=0);0==this.A&&U(this)&&Nm(U(this));this.removeAuthTokenListener(a);};
    k.addAuthTokenListener=function(a){var b=this;this.u.push(a);T(this,this.i.then(function(){b.m||Ta(b.u,a)&&a(Qn(b));}));};k.removeAuthTokenListener=function(a){Va(this.u,function(b){return b==a});};function Pn(a,b){a.P.push(b);T(a,a.i.then(function(){!a.m&&Ta(a.P,b)&&a.X!==a.getUid()&&(a.X=a.getUid(),b(Qn(a)));}));}
    k.delete=function(){this.m=!0;for(var a=0;a<this.R.length;a++)this.R[a].cancel("app-deleted");this.R=[];this.l&&(a=this.l,a.b.removeListener(rn("local"),a.a,this.pa));this.b&&(Ll(this.b,this),Vl(this.b.b));return Promise.resolve()};function T(a,b){a.R.push(b);b.na(function(){Ua(a.R,b);});return b}k.gc=function(a){return T(this,Xi(this.a,a))};k.Ac=function(a){return !!bh(a)};
    k.vb=function(a,b){var c=this;return T(this,D().then(function(){var d=new Of(b);if(!d.c)throw new t("argument-error",Wf+" must be true when sending sign in link to email");return Yf(d)}).then(function(d){return c.a.vb(a,d)}).then(function(){}))};k.hd=function(a){return this.Qa(a).then(function(b){return b.data.email})};k.mb=function(a,b){return T(this,this.a.mb(a,b).then(function(){}))};k.Qa=function(a){return T(this,this.a.Qa(a).then(function(b){return new rf(b)}))};
    k.ib=function(a){return T(this,this.a.ib(a).then(function(){}))};k.ub=function(a,b){var c=this;return T(this,D().then(function(){return "undefined"===typeof b||kb(b)?{}:Yf(new Of(b))}).then(function(d){return c.a.ub(a,d)}).then(function(){}))};k.Vc=function(a,b){return T(this,bm(this,a,b,q(this.Za,this)))};
    k.Uc=function(a,b){var c=this;return T(this,D().then(function(){var d=b||me(),e=ah(a,d);d=bh(d);if(!d)throw new t("argument-error","Invalid email link!");if(d.tenantId!==c.S())throw new t("tenant-id-mismatch");return c.Za(e)}))};function Rn(){}Rn.prototype.render=function(){};Rn.prototype.reset=function(){};Rn.prototype.getResponse=function(){};Rn.prototype.execute=function(){};function Sn(){this.a={};this.b=1E12;}var Tn=null;Sn.prototype.render=function(a,b){this.a[this.b.toString()]=new Un(a,b);return this.b++};Sn.prototype.reset=function(a){var b=Vn(this,a);a=Wn(a);b&&a&&(b.delete(),delete this.a[a]);};Sn.prototype.getResponse=function(a){return (a=Vn(this,a))?a.getResponse():null};Sn.prototype.execute=function(a){(a=Vn(this,a))&&a.execute();};function Vn(a,b){return (b=Wn(b))?a.a[b]||null:null}function Wn(a){return (a="undefined"===typeof a?1E12:a)?a.toString():null}
    function Un(a,b){this.g=!1;this.c=b;this.a=this.b=null;this.h="invisible"!==this.c.size;this.f=fc(a);var c=this;this.i=function(){c.execute();};this.h?this.execute():jd(this.f,"click",this.i);}Un.prototype.getResponse=function(){Xn(this);return this.b};
    Un.prototype.execute=function(){Xn(this);var a=this;this.a||(this.a=setTimeout(function(){a.b=He();var b=a.c.callback,c=a.c["expired-callback"];if(b)try{b(a.b);}catch(d){}a.a=setTimeout(function(){a.a=null;a.b=null;if(c)try{c();}catch(d){}a.h&&a.execute();},6E4);},500));};Un.prototype.delete=function(){Xn(this);this.g=!0;clearTimeout(this.a);this.a=null;G(this.f,"click",this.i);};function Xn(a){if(a.g)throw Error("reCAPTCHA mock was already deleted!");}function Yn(){}M(Yn,"FACTOR_ID","phone");function Zn(){}Zn.prototype.g=function(){Tn||(Tn=new Sn);return D(Tn)};Zn.prototype.c=function(){};var $n=null;function ao(){this.b=l.grecaptcha?Infinity:0;this.f=null;this.a="__rcb"+Math.floor(1E6*Math.random()).toString();}var bo=new ob(pb,"https://www.google.com/recaptcha/api.js?onload=%{onload}&render=explicit&hl=%{hl}"),co=new Ue(3E4,6E4);
    ao.prototype.g=function(a){var b=this;return new C(function(c,d){var e=setTimeout(function(){d(new t("network-request-failed"));},co.get());if(!l.grecaptcha||a!==b.f&&!b.b){l[b.a]=function(){if(l.grecaptcha){b.f=a;var g=l.grecaptcha.render;l.grecaptcha.render=function(h,m){h=g(h,m);b.b++;return h};clearTimeout(e);c(l.grecaptcha);}else clearTimeout(e),d(new t("internal-error"));delete l[b.a];};var f=xb(bo,{onload:b.a,hl:a||""});D(xi(f)).s(function(){clearTimeout(e);d(new t("internal-error","Unable to load external reCAPTCHA dependencies!"));});}else clearTimeout(e),
    c(l.grecaptcha);})};ao.prototype.c=function(){this.b--;};var eo=null;function fo(a,b,c,d,e,f,g){M(this,"type","recaptcha");this.c=this.f=null;this.A=!1;this.m=b;this.g=null;g?($n||($n=new Zn),g=$n):(eo||(eo=new ao),g=eo);this.v=g;this.a=c||{theme:"light",type:"image"};this.h=[];if(this.a[go])throw new t("argument-error","sitekey should not be provided for reCAPTCHA as one is automatically provisioned for the current project.");this.i="invisible"===this.a[ho];if(!l.document)throw new t("operation-not-supported-in-this-environment","RecaptchaVerifier is only supported in a browser HTTP/HTTPS environment with DOM support.");
    if(!fc(b)||!this.i&&fc(b).hasChildNodes())throw new t("argument-error","reCAPTCHA container is either not found or already contains inner elements!");this.o=new Ei(a,f||null,e||null);this.u=d||function(){return null};var h=this;this.l=[];var m=this.a[io];this.a[io]=function(v){jo(h,v);if("function"===typeof m)m(v);else if("string"===typeof m){var B=L(m,l);"function"===typeof B&&B(v);}};var p=this.a[ko];this.a[ko]=function(){jo(h,null);if("function"===typeof p)p();else if("string"===typeof p){var v=
    L(p,l);"function"===typeof v&&v();}};}var io="callback",ko="expired-callback",go="sitekey",ho="size";function jo(a,b){for(var c=0;c<a.l.length;c++)try{a.l[c](b);}catch(d){}}function lo(a,b){Va(a.l,function(c){return c==b});}function mo(a,b){a.h.push(b);b.na(function(){Ua(a.h,b);});return b}k=fo.prototype;
    k.Ia=function(){var a=this;return this.f?this.f:this.f=mo(this,D().then(function(){if(Ne()&&!Ee())return ze();throw new t("operation-not-supported-in-this-environment","RecaptchaVerifier is only supported in a browser HTTP/HTTPS environment.");}).then(function(){return a.v.g(a.u())}).then(function(b){a.g=b;return O(a.o,Fj,{})}).then(function(b){a.a[go]=b.recaptchaSiteKey;}).s(function(b){a.f=null;throw b;}))};
    k.render=function(){no(this);var a=this;return mo(this,this.Ia().then(function(){if(null===a.c){var b=a.m;if(!a.i){var c=fc(b);b=ic("DIV");c.appendChild(b);}a.c=a.g.render(b,a.a);}return a.c}))};k.verify=function(){no(this);var a=this;return mo(this,this.render().then(function(b){return new C(function(c){var d=a.g.getResponse(b);if(d)c(d);else {var e=function(f){f&&(lo(a,e),c(f));};a.l.push(e);a.i&&a.g.execute(a.c);}})}))};k.reset=function(){no(this);null!==this.c&&this.g.reset(this.c);};
    function no(a){if(a.A)throw new t("internal-error","RecaptchaVerifier instance has been destroyed.");}k.clear=function(){no(this);this.A=!0;this.v.c();for(var a=0;a<this.h.length;a++)this.h[a].cancel("RecaptchaVerifier instance has been destroyed.");if(!this.i){a=fc(this.m);for(var b;b=a.firstChild;)a.removeChild(b);}};
    function oo(a,b,c){var d=!1;try{this.b=c||firebase.app();}catch(g){throw new t("argument-error","No firebase.app.App instance is currently initialized.");}if(this.b.options&&this.b.options.apiKey)c=this.b.options.apiKey;else throw new t("invalid-api-key");var e=this,f=null;try{f=this.b.auth().Ga();}catch(g){}try{d=this.b.auth().settings.appVerificationDisabledForTesting;}catch(g){}f=firebase.SDK_VERSION?Je(firebase.SDK_VERSION,f):null;fo.call(this,c,a,b,function(){try{var g=e.b.auth().ka();}catch(h){g=
    null;}return g},f,Aa(Ba),d);}r(oo,fo);function po(a,b,c,d){a:{c=Array.prototype.slice.call(c);var e=0;for(var f=!1,g=0;g<b.length;g++)if(b[g].optional)f=!0;else {if(f)throw new t("internal-error","Argument validator encountered a required argument after an optional argument.");e++;}f=b.length;if(c.length<e||f<c.length)d="Expected "+(e==f?1==e?"1 argument":e+" arguments":e+"-"+f+" arguments")+" but got "+c.length+".";else {for(e=0;e<c.length;e++)if(f=b[e].optional&&void 0===c[e],!b[e].K(c[e])&&!f){b=b[e];if(0>e||e>=qo.length)throw new t("internal-error",
    "Argument validator received an unsupported number of arguments.");c=qo[e];d=(d?"":c+" argument ")+(b.name?'"'+b.name+'" ':"")+"must be "+b.J+".";break a}d=null;}}if(d)throw new t("argument-error",a+" failed: "+d);}var qo="First Second Third Fourth Fifth Sixth Seventh Eighth Ninth".split(" ");function V(a,b){return {name:a||"",J:"a valid string",optional:!!b,K:function(c){return "string"===typeof c}}}
    function ro(a,b){return {name:a||"",J:"a boolean",optional:!!b,K:function(c){return "boolean"===typeof c}}}function W(a,b){return {name:a||"",J:"a valid object",optional:!!b,K:n}}function so(a,b){return {name:a||"",J:"a function",optional:!!b,K:function(c){return "function"===typeof c}}}function to(a,b){return {name:a||"",J:"null",optional:!!b,K:function(c){return null===c}}}function uo(){return {name:"",J:"an HTML element",optional:!1,K:function(a){return !!(a&&a instanceof Element)}}}
    function vo(){return {name:"auth",J:"an instance of Firebase Auth",optional:!0,K:function(a){return !!(a&&a instanceof zn)}}}function wo(){return {name:"app",J:"an instance of Firebase App",optional:!0,K:function(a){return !!(a&&a instanceof firebase.app.App)}}}function xo(a){return {name:a?a+"Credential":"credential",J:a?"a valid "+a+" credential":"a valid credential",optional:!1,K:function(b){if(!b)return !1;var c=!a||b.providerId===a;return !(!b.ja||!c)}}}
    function yo(){return {name:"multiFactorAssertion",J:"a valid multiFactorAssertion",optional:!1,K:function(a){return a?!!a.rb:!1}}}function zo(){return {name:"authProvider",J:"a valid Auth provider",optional:!1,K:function(a){return !!(a&&a.providerId&&a.hasOwnProperty&&a.hasOwnProperty("isOAuthProvider"))}}}function Ao(a,b){return n(a)&&"string"===typeof a.type&&a.type===b&&"function"===typeof a.Ha}function Bo(a){return n(a)&&"string"===typeof a.uid}
    function Co(){return {name:"applicationVerifier",J:"an implementation of firebase.auth.ApplicationVerifier",optional:!1,K:function(a){return !(!a||"string"!==typeof a.type||"function"!==typeof a.verify)}}}function X(a,b,c,d){return {name:c||"",J:a.J+" or "+b.J,optional:!!d,K:function(e){return a.K(e)||b.K(e)}}}function Y(a,b){for(var c in b){var d=b[c].name;a[d]=Do(d,a[c],b[c].j);}}function Eo(a,b){for(var c in b){var d=b[c].name;d!==c&&Object.defineProperty(a,d,{get:ta(function(e){return this[e]},c),set:ta(function(e,f,g,h){po(e,[g],[h],!0);this[f]=h;},d,c,b[c].jb),enumerable:!0});}}function Z(a,b,c,d){a[b]=Do(b,c,d);}
    function Do(a,b,c){function d(){var g=Array.prototype.slice.call(arguments);po(e,c,g);return b.apply(this,g)}if(!c)return b;var e=Fo(a),f;for(f in b)d[f]=b[f];for(f in b.prototype)d.prototype[f]=b.prototype[f];return d}function Fo(a){a=a.split(".");return a[a.length-1]}Y(zn.prototype,{ib:{name:"applyActionCode",j:[V("code")]},Qa:{name:"checkActionCode",j:[V("code")]},mb:{name:"confirmPasswordReset",j:[V("code"),V("newPassword")]},dc:{name:"createUserWithEmailAndPassword",j:[V("email"),V("password")]},gc:{name:"fetchSignInMethodsForEmail",j:[V("email")]},qa:{name:"getRedirectResult",j:[]},Ac:{name:"isSignInWithEmailLink",j:[V("emailLink")]},Gc:{name:"onAuthStateChanged",j:[X(W(),so(),"nextOrObserver"),so("opt_error",!0),so("opt_completed",!0)]},Hc:{name:"onIdTokenChanged",
    j:[X(W(),so(),"nextOrObserver"),so("opt_error",!0),so("opt_completed",!0)]},ub:{name:"sendPasswordResetEmail",j:[V("email"),X(W("opt_actionCodeSettings",!0),to(null,!0),"opt_actionCodeSettings",!0)]},vb:{name:"sendSignInLinkToEmail",j:[V("email"),W("actionCodeSettings")]},wb:{name:"setPersistence",j:[V("persistence")]},Rc:{name:"signInAndRetrieveDataWithCredential",j:[xo()]},yb:{name:"signInAnonymously",j:[]},Za:{name:"signInWithCredential",j:[xo()]},Sc:{name:"signInWithCustomToken",j:[V("token")]},
    Tc:{name:"signInWithEmailAndPassword",j:[V("email"),V("password")]},Uc:{name:"signInWithEmailLink",j:[V("email"),V("emailLink",!0)]},Vc:{name:"signInWithPhoneNumber",j:[V("phoneNumber"),Co()]},Wc:{name:"signInWithPopup",j:[zo()]},Xc:{name:"signInWithRedirect",j:[zo()]},cd:{name:"updateCurrentUser",j:[X(function(a){return {name:"user",J:"an instance of Firebase User",optional:!!a,K:function(b){return !!(b&&b instanceof Dm)}}}(),to(),"user")]},zb:{name:"signOut",j:[]},toJSON:{name:"toJSON",j:[V(null,
    !0)]},ed:{name:"useDeviceLanguage",j:[]},fd:{name:"useEmulator",j:[V("url")]},hd:{name:"verifyPasswordResetCode",j:[V("code")]}});Eo(zn.prototype,{lc:{name:"languageCode",jb:X(V(),to(),"languageCode")},ti:{name:"tenantId",jb:X(V(),to(),"tenantId")}});zn.Persistence=Mk;zn.Persistence.LOCAL="local";zn.Persistence.SESSION="session";zn.Persistence.NONE="none";
    Y(Dm.prototype,{"delete":{name:"delete",j:[]},nc:{name:"getIdTokenResult",j:[ro("opt_forceRefresh",!0)]},I:{name:"getIdToken",j:[ro("opt_forceRefresh",!0)]},Bc:{name:"linkAndRetrieveDataWithCredential",j:[xo()]},pb:{name:"linkWithCredential",j:[xo()]},Cc:{name:"linkWithPhoneNumber",j:[V("phoneNumber"),Co()]},Dc:{name:"linkWithPopup",j:[zo()]},Ec:{name:"linkWithRedirect",j:[zo()]},Kc:{name:"reauthenticateAndRetrieveDataWithCredential",j:[xo()]},sb:{name:"reauthenticateWithCredential",j:[xo()]},Lc:{name:"reauthenticateWithPhoneNumber",
    j:[V("phoneNumber"),Co()]},Mc:{name:"reauthenticateWithPopup",j:[zo()]},Nc:{name:"reauthenticateWithRedirect",j:[zo()]},reload:{name:"reload",j:[]},tb:{name:"sendEmailVerification",j:[X(W("opt_actionCodeSettings",!0),to(null,!0),"opt_actionCodeSettings",!0)]},toJSON:{name:"toJSON",j:[V(null,!0)]},bd:{name:"unlink",j:[V("provider")]},Ab:{name:"updateEmail",j:[V("email")]},Bb:{name:"updatePassword",j:[V("password")]},dd:{name:"updatePhoneNumber",j:[xo("phone")]},Cb:{name:"updateProfile",j:[W("profile")]},
    Db:{name:"verifyBeforeUpdateEmail",j:[V("email"),X(W("opt_actionCodeSettings",!0),to(null,!0),"opt_actionCodeSettings",!0)]}});Y(Sn.prototype,{execute:{name:"execute"},render:{name:"render"},reset:{name:"reset"},getResponse:{name:"getResponse"}});Y(Rn.prototype,{execute:{name:"execute"},render:{name:"render"},reset:{name:"reset"},getResponse:{name:"getResponse"}});Y(C.prototype,{na:{name:"finally"},s:{name:"catch"},then:{name:"then"}});
    Eo($l.prototype,{appVerificationDisabled:{name:"appVerificationDisabledForTesting",jb:ro("appVerificationDisabledForTesting")}});Y(am.prototype,{confirm:{name:"confirm",j:[V("verificationCode")]}});Z(xg,"fromJSON",function(a){a="string"===typeof a?JSON.parse(a):a;for(var b,c=[Ig,$g,gh,Fg],d=0;d<c.length;d++)if(b=c[d](a))return b;return null},[X(V(),W(),"json")]);Z(Vg,"credential",function(a,b){return new Ug(a,b)},[V("email"),V("password")]);Y(Ug.prototype,{w:{name:"toJSON",j:[V(null,!0)]}});
    Y(Mg.prototype,{Ca:{name:"addScope",j:[V("scope")]},Ka:{name:"setCustomParameters",j:[W("customOAuthParameters")]}});Z(Mg,"credential",Ng,[X(V(),W(),"token")]);Z(Vg,"credentialWithLink",ah,[V("email"),V("emailLink")]);Y(Og.prototype,{Ca:{name:"addScope",j:[V("scope")]},Ka:{name:"setCustomParameters",j:[W("customOAuthParameters")]}});Z(Og,"credential",Pg,[X(V(),W(),"token")]);Y(Qg.prototype,{Ca:{name:"addScope",j:[V("scope")]},Ka:{name:"setCustomParameters",j:[W("customOAuthParameters")]}});
    Z(Qg,"credential",Rg,[X(V(),X(W(),to()),"idToken"),X(V(),to(),"accessToken",!0)]);Y(Sg.prototype,{Ka:{name:"setCustomParameters",j:[W("customOAuthParameters")]}});Z(Sg,"credential",Tg,[X(V(),W(),"token"),V("secret",!0)]);Y(Lg.prototype,{Ca:{name:"addScope",j:[V("scope")]},credential:{name:"credential",j:[X(V(),X(W(),to()),"optionsOrIdToken"),X(V(),to(),"accessToken",!0)]},Ka:{name:"setCustomParameters",j:[W("customOAuthParameters")]}});Y(Gg.prototype,{w:{name:"toJSON",j:[V(null,!0)]}});
    Y(Ag.prototype,{w:{name:"toJSON",j:[V(null,!0)]}});Z(hh,"credential",lh,[V("verificationId"),V("verificationCode")]);
    Y(hh.prototype,{eb:{name:"verifyPhoneNumber",j:[X(V(),function(a,b){return {name:a||"phoneInfoOptions",J:"valid phone info options",optional:!!b,K:function(c){return c?c.session&&c.phoneNumber?Ao(c.session,vg)&&"string"===typeof c.phoneNumber:c.session&&c.multiFactorHint?Ao(c.session,wg)&&Bo(c.multiFactorHint):c.session&&c.multiFactorUid?Ao(c.session,wg)&&"string"===typeof c.multiFactorUid:c.phoneNumber?"string"===typeof c.phoneNumber:!1:!1}}}(),"phoneInfoOptions"),Co()]}});
    Y(ch.prototype,{w:{name:"toJSON",j:[V(null,!0)]}});Y(t.prototype,{toJSON:{name:"toJSON",j:[V(null,!0)]}});Y(uh.prototype,{toJSON:{name:"toJSON",j:[V(null,!0)]}});Y(th.prototype,{toJSON:{name:"toJSON",j:[V(null,!0)]}});Y(gm.prototype,{toJSON:{name:"toJSON",j:[V(null,!0)]}});Y(dm.prototype,{Qc:{name:"resolveSignIn",j:[yo()]}});
    Y(om.prototype,{Qb:{name:"getSession",j:[]},ec:{name:"enroll",j:[yo(),V("displayName",!0)]},ad:{name:"unenroll",j:[X({name:"multiFactorInfo",J:"a valid multiFactorInfo",optional:!1,K:Bo},V(),"multiFactorInfoIdentifier")]}});Y(oo.prototype,{clear:{name:"clear",j:[]},render:{name:"render",j:[]},verify:{name:"verify",j:[]}});Z(Ff,"parseLink",Nf,[V("link")]);Z(Yn,"assertion",function(a){return new mm(a)},[xo("phone")]);
    (function(){if("undefined"!==typeof firebase&&firebase.INTERNAL&&firebase.INTERNAL.registerComponent){var a={ActionCodeInfo:{Operation:{EMAIL_SIGNIN:wf,PASSWORD_RESET:"PASSWORD_RESET",RECOVER_EMAIL:"RECOVER_EMAIL",REVERT_SECOND_FACTOR_ADDITION:yf,VERIFY_AND_CHANGE_EMAIL:xf,VERIFY_EMAIL:"VERIFY_EMAIL"}},Auth:zn,AuthCredential:xg,Error:t};Z(a,"EmailAuthProvider",Vg,[]);Z(a,"FacebookAuthProvider",Mg,[]);Z(a,"GithubAuthProvider",Og,[]);Z(a,"GoogleAuthProvider",Qg,[]);Z(a,"TwitterAuthProvider",Sg,[]);
    Z(a,"OAuthProvider",Lg,[V("providerId")]);Z(a,"SAMLAuthProvider",Kg,[V("providerId")]);Z(a,"PhoneAuthProvider",hh,[vo()]);Z(a,"RecaptchaVerifier",oo,[X(V(),uo(),"recaptchaContainer"),W("recaptchaParameters",!0),wo()]);Z(a,"ActionCodeURL",Ff,[]);Z(a,"PhoneMultiFactorGenerator",Yn,[]);firebase.INTERNAL.registerComponent({name:"auth",instanceFactory:function(b){b=b.getProvider("app").getImmediate();return new zn(b)},multipleInstances:!1,serviceProps:a,instantiationMode:"LAZY",type:"PUBLIC"});firebase.INTERNAL.registerComponent({name:"auth-internal",
    instanceFactory:function(b){b=b.getProvider("auth").getImmediate();return {getUid:q(b.getUid,b),getToken:q(b.mc,b),addAuthTokenListener:q(b.cc,b),removeAuthTokenListener:q(b.Oc,b)}},multipleInstances:!1,instantiationMode:"LAZY",type:"PRIVATE"});firebase.registerVersion("@firebase/auth","0.15.0");firebase.INTERNAL.extendNamespace({User:Dm});}else throw Error("Cannot find the firebase namespace; be sure to include firebase-app.js before this library.");})();}).apply(typeof commonjsGlobal !== 'undefined' ? commonjsGlobal : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {});

    var dialogPolyfill = createCommonjsModule(function (module) {
    (function() {

      // nb. This is for IE10 and lower _only_.
      var supportCustomEvent = window.CustomEvent;
      if (!supportCustomEvent || typeof supportCustomEvent === 'object') {
        supportCustomEvent = function CustomEvent(event, x) {
          x = x || {};
          var ev = document.createEvent('CustomEvent');
          ev.initCustomEvent(event, !!x.bubbles, !!x.cancelable, x.detail || null);
          return ev;
        };
        supportCustomEvent.prototype = window.Event.prototype;
      }

      /**
       * @param {Element} el to check for stacking context
       * @return {boolean} whether this el or its parents creates a stacking context
       */
      function createsStackingContext(el) {
        while (el && el !== document.body) {
          var s = window.getComputedStyle(el);
          var invalid = function(k, ok) {
            return !(s[k] === undefined || s[k] === ok);
          };
          if (s.opacity < 1 ||
              invalid('zIndex', 'auto') ||
              invalid('transform', 'none') ||
              invalid('mixBlendMode', 'normal') ||
              invalid('filter', 'none') ||
              invalid('perspective', 'none') ||
              s['isolation'] === 'isolate' ||
              s.position === 'fixed' ||
              s.webkitOverflowScrolling === 'touch') {
            return true;
          }
          el = el.parentElement;
        }
        return false;
      }

      /**
       * Finds the nearest <dialog> from the passed element.
       *
       * @param {Element} el to search from
       * @return {HTMLDialogElement} dialog found
       */
      function findNearestDialog(el) {
        while (el) {
          if (el.localName === 'dialog') {
            return /** @type {HTMLDialogElement} */ (el);
          }
          el = el.parentElement;
        }
        return null;
      }

      /**
       * Blur the specified element, as long as it's not the HTML body element.
       * This works around an IE9/10 bug - blurring the body causes Windows to
       * blur the whole application.
       *
       * @param {Element} el to blur
       */
      function safeBlur(el) {
        if (el && el.blur && el !== document.body) {
          el.blur();
        }
      }

      /**
       * @param {!NodeList} nodeList to search
       * @param {Node} node to find
       * @return {boolean} whether node is inside nodeList
       */
      function inNodeList(nodeList, node) {
        for (var i = 0; i < nodeList.length; ++i) {
          if (nodeList[i] === node) {
            return true;
          }
        }
        return false;
      }

      /**
       * @param {HTMLFormElement} el to check
       * @return {boolean} whether this form has method="dialog"
       */
      function isFormMethodDialog(el) {
        if (!el || !el.hasAttribute('method')) {
          return false;
        }
        return el.getAttribute('method').toLowerCase() === 'dialog';
      }

      /**
       * @param {!HTMLDialogElement} dialog to upgrade
       * @constructor
       */
      function dialogPolyfillInfo(dialog) {
        this.dialog_ = dialog;
        this.replacedStyleTop_ = false;
        this.openAsModal_ = false;

        // Set a11y role. Browsers that support dialog implicitly know this already.
        if (!dialog.hasAttribute('role')) {
          dialog.setAttribute('role', 'dialog');
        }

        dialog.show = this.show.bind(this);
        dialog.showModal = this.showModal.bind(this);
        dialog.close = this.close.bind(this);

        if (!('returnValue' in dialog)) {
          dialog.returnValue = '';
        }

        if ('MutationObserver' in window) {
          var mo = new MutationObserver(this.maybeHideModal.bind(this));
          mo.observe(dialog, {attributes: true, attributeFilter: ['open']});
        } else {
          // IE10 and below support. Note that DOMNodeRemoved etc fire _before_ removal. They also
          // seem to fire even if the element was removed as part of a parent removal. Use the removed
          // events to force downgrade (useful if removed/immediately added).
          var removed = false;
          var cb = function() {
            removed ? this.downgradeModal() : this.maybeHideModal();
            removed = false;
          }.bind(this);
          var timeout;
          var delayModel = function(ev) {
            if (ev.target !== dialog) { return; }  // not for a child element
            var cand = 'DOMNodeRemoved';
            removed |= (ev.type.substr(0, cand.length) === cand);
            window.clearTimeout(timeout);
            timeout = window.setTimeout(cb, 0);
          };
          ['DOMAttrModified', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument'].forEach(function(name) {
            dialog.addEventListener(name, delayModel);
          });
        }
        // Note that the DOM is observed inside DialogManager while any dialog
        // is being displayed as a modal, to catch modal removal from the DOM.

        Object.defineProperty(dialog, 'open', {
          set: this.setOpen.bind(this),
          get: dialog.hasAttribute.bind(dialog, 'open')
        });

        this.backdrop_ = document.createElement('div');
        this.backdrop_.className = 'backdrop';
        this.backdrop_.addEventListener('click', this.backdropClick_.bind(this));
      }

      dialogPolyfillInfo.prototype = {

        get dialog() {
          return this.dialog_;
        },

        /**
         * Maybe remove this dialog from the modal top layer. This is called when
         * a modal dialog may no longer be tenable, e.g., when the dialog is no
         * longer open or is no longer part of the DOM.
         */
        maybeHideModal: function() {
          if (this.dialog_.hasAttribute('open') && document.body.contains(this.dialog_)) { return; }
          this.downgradeModal();
        },

        /**
         * Remove this dialog from the modal top layer, leaving it as a non-modal.
         */
        downgradeModal: function() {
          if (!this.openAsModal_) { return; }
          this.openAsModal_ = false;
          this.dialog_.style.zIndex = '';

          // This won't match the native <dialog> exactly because if the user set top on a centered
          // polyfill dialog, that top gets thrown away when the dialog is closed. Not sure it's
          // possible to polyfill this perfectly.
          if (this.replacedStyleTop_) {
            this.dialog_.style.top = '';
            this.replacedStyleTop_ = false;
          }

          // Clear the backdrop and remove from the manager.
          this.backdrop_.parentNode && this.backdrop_.parentNode.removeChild(this.backdrop_);
          dialogPolyfill.dm.removeDialog(this);
        },

        /**
         * @param {boolean} value whether to open or close this dialog
         */
        setOpen: function(value) {
          if (value) {
            this.dialog_.hasAttribute('open') || this.dialog_.setAttribute('open', '');
          } else {
            this.dialog_.removeAttribute('open');
            this.maybeHideModal();  // nb. redundant with MutationObserver
          }
        },

        /**
         * Handles clicks on the fake .backdrop element, redirecting them as if
         * they were on the dialog itself.
         *
         * @param {!Event} e to redirect
         */
        backdropClick_: function(e) {
          if (!this.dialog_.hasAttribute('tabindex')) {
            // Clicking on the backdrop should move the implicit cursor, even if dialog cannot be
            // focused. Create a fake thing to focus on. If the backdrop was _before_ the dialog, this
            // would not be needed - clicks would move the implicit cursor there.
            var fake = document.createElement('div');
            this.dialog_.insertBefore(fake, this.dialog_.firstChild);
            fake.tabIndex = -1;
            fake.focus();
            this.dialog_.removeChild(fake);
          } else {
            this.dialog_.focus();
          }

          var redirectedEvent = document.createEvent('MouseEvents');
          redirectedEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window,
              e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey,
              e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
          this.dialog_.dispatchEvent(redirectedEvent);
          e.stopPropagation();
        },

        /**
         * Focuses on the first focusable element within the dialog. This will always blur the current
         * focus, even if nothing within the dialog is found.
         */
        focus_: function() {
          // Find element with `autofocus` attribute, or fall back to the first form/tabindex control.
          var target = this.dialog_.querySelector('[autofocus]:not([disabled])');
          if (!target && this.dialog_.tabIndex >= 0) {
            target = this.dialog_;
          }
          if (!target) {
            // Note that this is 'any focusable area'. This list is probably not exhaustive, but the
            // alternative involves stepping through and trying to focus everything.
            var opts = ['button', 'input', 'keygen', 'select', 'textarea'];
            var query = opts.map(function(el) {
              return el + ':not([disabled])';
            });
            // TODO(samthor): tabindex values that are not numeric are not focusable.
            query.push('[tabindex]:not([disabled]):not([tabindex=""])');  // tabindex != "", not disabled
            target = this.dialog_.querySelector(query.join(', '));
          }
          safeBlur(document.activeElement);
          target && target.focus();
        },

        /**
         * Sets the zIndex for the backdrop and dialog.
         *
         * @param {number} dialogZ
         * @param {number} backdropZ
         */
        updateZIndex: function(dialogZ, backdropZ) {
          if (dialogZ < backdropZ) {
            throw new Error('dialogZ should never be < backdropZ');
          }
          this.dialog_.style.zIndex = dialogZ;
          this.backdrop_.style.zIndex = backdropZ;
        },

        /**
         * Shows the dialog. If the dialog is already open, this does nothing.
         */
        show: function() {
          if (!this.dialog_.open) {
            this.setOpen(true);
            this.focus_();
          }
        },

        /**
         * Show this dialog modally.
         */
        showModal: function() {
          if (this.dialog_.hasAttribute('open')) {
            throw new Error('Failed to execute \'showModal\' on dialog: The element is already open, and therefore cannot be opened modally.');
          }
          if (!document.body.contains(this.dialog_)) {
            throw new Error('Failed to execute \'showModal\' on dialog: The element is not in a Document.');
          }
          if (!dialogPolyfill.dm.pushDialog(this)) {
            throw new Error('Failed to execute \'showModal\' on dialog: There are too many open modal dialogs.');
          }

          if (createsStackingContext(this.dialog_.parentElement)) {
            console.warn('A dialog is being shown inside a stacking context. ' +
                'This may cause it to be unusable. For more information, see this link: ' +
                'https://github.com/GoogleChrome/dialog-polyfill/#stacking-context');
          }

          this.setOpen(true);
          this.openAsModal_ = true;

          // Optionally center vertically, relative to the current viewport.
          if (dialogPolyfill.needsCentering(this.dialog_)) {
            dialogPolyfill.reposition(this.dialog_);
            this.replacedStyleTop_ = true;
          } else {
            this.replacedStyleTop_ = false;
          }

          // Insert backdrop.
          this.dialog_.parentNode.insertBefore(this.backdrop_, this.dialog_.nextSibling);

          // Focus on whatever inside the dialog.
          this.focus_();
        },

        /**
         * Closes this HTMLDialogElement. This is optional vs clearing the open
         * attribute, however this fires a 'close' event.
         *
         * @param {string=} opt_returnValue to use as the returnValue
         */
        close: function(opt_returnValue) {
          if (!this.dialog_.hasAttribute('open')) {
            throw new Error('Failed to execute \'close\' on dialog: The element does not have an \'open\' attribute, and therefore cannot be closed.');
          }
          this.setOpen(false);

          // Leave returnValue untouched in case it was set directly on the element
          if (opt_returnValue !== undefined) {
            this.dialog_.returnValue = opt_returnValue;
          }

          // Triggering "close" event for any attached listeners on the <dialog>.
          var closeEvent = new supportCustomEvent('close', {
            bubbles: false,
            cancelable: false
          });
          this.dialog_.dispatchEvent(closeEvent);
        }

      };

      var dialogPolyfill = {};

      dialogPolyfill.reposition = function(element) {
        var scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
        var topValue = scrollTop + (window.innerHeight - element.offsetHeight) / 2;
        element.style.top = Math.max(scrollTop, topValue) + 'px';
      };

      dialogPolyfill.isInlinePositionSetByStylesheet = function(element) {
        for (var i = 0; i < document.styleSheets.length; ++i) {
          var styleSheet = document.styleSheets[i];
          var cssRules = null;
          // Some browsers throw on cssRules.
          try {
            cssRules = styleSheet.cssRules;
          } catch (e) {}
          if (!cssRules) { continue; }
          for (var j = 0; j < cssRules.length; ++j) {
            var rule = cssRules[j];
            var selectedNodes = null;
            // Ignore errors on invalid selector texts.
            try {
              selectedNodes = document.querySelectorAll(rule.selectorText);
            } catch(e) {}
            if (!selectedNodes || !inNodeList(selectedNodes, element)) {
              continue;
            }
            var cssTop = rule.style.getPropertyValue('top');
            var cssBottom = rule.style.getPropertyValue('bottom');
            if ((cssTop && cssTop !== 'auto') || (cssBottom && cssBottom !== 'auto')) {
              return true;
            }
          }
        }
        return false;
      };

      dialogPolyfill.needsCentering = function(dialog) {
        var computedStyle = window.getComputedStyle(dialog);
        if (computedStyle.position !== 'absolute') {
          return false;
        }

        // We must determine whether the top/bottom specified value is non-auto.  In
        // WebKit/Blink, checking computedStyle.top == 'auto' is sufficient, but
        // Firefox returns the used value. So we do this crazy thing instead: check
        // the inline style and then go through CSS rules.
        if ((dialog.style.top !== 'auto' && dialog.style.top !== '') ||
            (dialog.style.bottom !== 'auto' && dialog.style.bottom !== '')) {
          return false;
        }
        return !dialogPolyfill.isInlinePositionSetByStylesheet(dialog);
      };

      /**
       * @param {!Element} element to force upgrade
       */
      dialogPolyfill.forceRegisterDialog = function(element) {
        if (window.HTMLDialogElement || element.showModal) {
          console.warn('This browser already supports <dialog>, the polyfill ' +
              'may not work correctly', element);
        }
        if (element.localName !== 'dialog') {
          throw new Error('Failed to register dialog: The element is not a dialog.');
        }
        new dialogPolyfillInfo(/** @type {!HTMLDialogElement} */ (element));
      };

      /**
       * @param {!Element} element to upgrade, if necessary
       */
      dialogPolyfill.registerDialog = function(element) {
        if (!element.showModal) {
          dialogPolyfill.forceRegisterDialog(element);
        }
      };

      /**
       * @constructor
       */
      dialogPolyfill.DialogManager = function() {
        /** @type {!Array<!dialogPolyfillInfo>} */
        this.pendingDialogStack = [];

        var checkDOM = this.checkDOM_.bind(this);

        // The overlay is used to simulate how a modal dialog blocks the document.
        // The blocking dialog is positioned on top of the overlay, and the rest of
        // the dialogs on the pending dialog stack are positioned below it. In the
        // actual implementation, the modal dialog stacking is controlled by the
        // top layer, where z-index has no effect.
        this.overlay = document.createElement('div');
        this.overlay.className = '_dialog_overlay';
        this.overlay.addEventListener('click', function(e) {
          this.forwardTab_ = undefined;
          e.stopPropagation();
          checkDOM([]);  // sanity-check DOM
        }.bind(this));

        this.handleKey_ = this.handleKey_.bind(this);
        this.handleFocus_ = this.handleFocus_.bind(this);

        this.zIndexLow_ = 100000;
        this.zIndexHigh_ = 100000 + 150;

        this.forwardTab_ = undefined;

        if ('MutationObserver' in window) {
          this.mo_ = new MutationObserver(function(records) {
            var removed = [];
            records.forEach(function(rec) {
              for (var i = 0, c; c = rec.removedNodes[i]; ++i) {
                if (!(c instanceof Element)) {
                  continue;
                } else if (c.localName === 'dialog') {
                  removed.push(c);
                }
                removed = removed.concat(c.querySelectorAll('dialog'));
              }
            });
            removed.length && checkDOM(removed);
          });
        }
      };

      /**
       * Called on the first modal dialog being shown. Adds the overlay and related
       * handlers.
       */
      dialogPolyfill.DialogManager.prototype.blockDocument = function() {
        document.documentElement.addEventListener('focus', this.handleFocus_, true);
        document.addEventListener('keydown', this.handleKey_);
        this.mo_ && this.mo_.observe(document, {childList: true, subtree: true});
      };

      /**
       * Called on the first modal dialog being removed, i.e., when no more modal
       * dialogs are visible.
       */
      dialogPolyfill.DialogManager.prototype.unblockDocument = function() {
        document.documentElement.removeEventListener('focus', this.handleFocus_, true);
        document.removeEventListener('keydown', this.handleKey_);
        this.mo_ && this.mo_.disconnect();
      };

      /**
       * Updates the stacking of all known dialogs.
       */
      dialogPolyfill.DialogManager.prototype.updateStacking = function() {
        var zIndex = this.zIndexHigh_;

        for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
          dpi.updateZIndex(--zIndex, --zIndex);
          if (i === 0) {
            this.overlay.style.zIndex = --zIndex;
          }
        }

        // Make the overlay a sibling of the dialog itself.
        var last = this.pendingDialogStack[0];
        if (last) {
          var p = last.dialog.parentNode || document.body;
          p.appendChild(this.overlay);
        } else if (this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
      };

      /**
       * @param {Element} candidate to check if contained or is the top-most modal dialog
       * @return {boolean} whether candidate is contained in top dialog
       */
      dialogPolyfill.DialogManager.prototype.containedByTopDialog_ = function(candidate) {
        while (candidate = findNearestDialog(candidate)) {
          for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
            if (dpi.dialog === candidate) {
              return i === 0;  // only valid if top-most
            }
          }
          candidate = candidate.parentElement;
        }
        return false;
      };

      dialogPolyfill.DialogManager.prototype.handleFocus_ = function(event) {
        if (this.containedByTopDialog_(event.target)) { return; }

        event.preventDefault();
        event.stopPropagation();
        safeBlur(/** @type {Element} */ (event.target));

        if (this.forwardTab_ === undefined) { return; }  // move focus only from a tab key

        var dpi = this.pendingDialogStack[0];
        var dialog = dpi.dialog;
        var position = dialog.compareDocumentPosition(event.target);
        if (position & Node.DOCUMENT_POSITION_PRECEDING) {
          if (this.forwardTab_) {  // forward
            dpi.focus_();
          } else {  // backwards
            document.documentElement.focus();
          }
        }

        return false;
      };

      dialogPolyfill.DialogManager.prototype.handleKey_ = function(event) {
        this.forwardTab_ = undefined;
        if (event.keyCode === 27) {
          event.preventDefault();
          event.stopPropagation();
          var cancelEvent = new supportCustomEvent('cancel', {
            bubbles: false,
            cancelable: true
          });
          var dpi = this.pendingDialogStack[0];
          if (dpi && dpi.dialog.dispatchEvent(cancelEvent)) {
            dpi.dialog.close();
          }
        } else if (event.keyCode === 9) {
          this.forwardTab_ = !event.shiftKey;
        }
      };

      /**
       * Finds and downgrades any known modal dialogs that are no longer displayed. Dialogs that are
       * removed and immediately readded don't stay modal, they become normal.
       *
       * @param {!Array<!HTMLDialogElement>} removed that have definitely been removed
       */
      dialogPolyfill.DialogManager.prototype.checkDOM_ = function(removed) {
        // This operates on a clone because it may cause it to change. Each change also calls
        // updateStacking, which only actually needs to happen once. But who removes many modal dialogs
        // at a time?!
        var clone = this.pendingDialogStack.slice();
        clone.forEach(function(dpi) {
          if (removed.indexOf(dpi.dialog) !== -1) {
            dpi.downgradeModal();
          } else {
            dpi.maybeHideModal();
          }
        });
      };

      /**
       * @param {!dialogPolyfillInfo} dpi
       * @return {boolean} whether the dialog was allowed
       */
      dialogPolyfill.DialogManager.prototype.pushDialog = function(dpi) {
        var allowed = (this.zIndexHigh_ - this.zIndexLow_) / 2 - 1;
        if (this.pendingDialogStack.length >= allowed) {
          return false;
        }
        if (this.pendingDialogStack.unshift(dpi) === 1) {
          this.blockDocument();
        }
        this.updateStacking();
        return true;
      };

      /**
       * @param {!dialogPolyfillInfo} dpi
       */
      dialogPolyfill.DialogManager.prototype.removeDialog = function(dpi) {
        var index = this.pendingDialogStack.indexOf(dpi);
        if (index === -1) { return; }

        this.pendingDialogStack.splice(index, 1);
        if (this.pendingDialogStack.length === 0) {
          this.unblockDocument();
        }
        this.updateStacking();
      };

      dialogPolyfill.dm = new dialogPolyfill.DialogManager();
      dialogPolyfill.formSubmitter = null;
      dialogPolyfill.useValue = null;

      /**
       * Installs global handlers, such as click listers and native method overrides. These are needed
       * even if a no dialog is registered, as they deal with <form method="dialog">.
       */
      if (window.HTMLDialogElement === undefined) {

        /**
         * If HTMLFormElement translates method="DIALOG" into 'get', then replace the descriptor with
         * one that returns the correct value.
         */
        var testForm = document.createElement('form');
        testForm.setAttribute('method', 'dialog');
        if (testForm.method !== 'dialog') {
          var methodDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'method');
          if (methodDescriptor) {
            // nb. Some older iOS and older PhantomJS fail to return the descriptor. Don't do anything
            // and don't bother to update the element.
            var realGet = methodDescriptor.get;
            methodDescriptor.get = function() {
              if (isFormMethodDialog(this)) {
                return 'dialog';
              }
              return realGet.call(this);
            };
            var realSet = methodDescriptor.set;
            methodDescriptor.set = function(v) {
              if (typeof v === 'string' && v.toLowerCase() === 'dialog') {
                return this.setAttribute('method', v);
              }
              return realSet.call(this, v);
            };
            Object.defineProperty(HTMLFormElement.prototype, 'method', methodDescriptor);
          }
        }

        /**
         * Global 'click' handler, to capture the <input type="submit"> or <button> element which has
         * submitted a <form method="dialog">. Needed as Safari and others don't report this inside
         * document.activeElement.
         */
        document.addEventListener('click', function(ev) {
          dialogPolyfill.formSubmitter = null;
          dialogPolyfill.useValue = null;
          if (ev.defaultPrevented) { return; }  // e.g. a submit which prevents default submission

          var target = /** @type {Element} */ (ev.target);
          if (!target || !isFormMethodDialog(target.form)) { return; }

          var valid = (target.type === 'submit' && ['button', 'input'].indexOf(target.localName) > -1);
          if (!valid) {
            if (!(target.localName === 'input' && target.type === 'image')) { return; }
            // this is a <input type="image">, which can submit forms
            dialogPolyfill.useValue = ev.offsetX + ',' + ev.offsetY;
          }

          var dialog = findNearestDialog(target);
          if (!dialog) { return; }

          dialogPolyfill.formSubmitter = target;
        }, false);

        /**
         * Replace the native HTMLFormElement.submit() method, as it won't fire the
         * submit event and give us a chance to respond.
         */
        var nativeFormSubmit = HTMLFormElement.prototype.submit;
        var replacementFormSubmit = function () {
          if (!isFormMethodDialog(this)) {
            return nativeFormSubmit.call(this);
          }
          var dialog = findNearestDialog(this);
          dialog && dialog.close();
        };
        HTMLFormElement.prototype.submit = replacementFormSubmit;

        /**
         * Global form 'dialog' method handler. Closes a dialog correctly on submit
         * and possibly sets its return value.
         */
        document.addEventListener('submit', function(ev) {
          var form = /** @type {HTMLFormElement} */ (ev.target);
          if (!isFormMethodDialog(form)) { return; }
          ev.preventDefault();

          var dialog = findNearestDialog(form);
          if (!dialog) { return; }

          // Forms can only be submitted via .submit() or a click (?), but anyway: sanity-check that
          // the submitter is correct before using its value as .returnValue.
          var s = dialogPolyfill.formSubmitter;
          if (s && s.form === form) {
            dialog.close(dialogPolyfill.useValue || s.value);
          } else {
            dialog.close();
          }
          dialogPolyfill.formSubmitter = null;
        }, true);
      }

      dialogPolyfill['forceRegisterDialog'] = dialogPolyfill.forceRegisterDialog;
      dialogPolyfill['registerDialog'] = dialogPolyfill.registerDialog;

      if ( typeof module['exports'] === 'object') {
        // CommonJS support
        module['exports'] = dialogPolyfill;
      } else {
        // all others
        window['dialogPolyfill'] = dialogPolyfill;
      }
    })();
    });

    /**
     * @license
     * Copyright 2015 Google Inc. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    /**
     * A component handler interface using the revealing module design pattern.
     * More details on this design pattern here:
     * https://github.com/jasonmayes/mdl-component-design-pattern
     *
     * @author Jason Mayes.
     */
    /* exported componentHandler */

    // Pre-defining the componentHandler interface, for closure documentation and
    // static verification.
    var componentHandler$1 = {
      /**
       * Searches existing DOM for elements of our component type and upgrades them
       * if they have not already been upgraded.
       *
       * @param {string=} optJsClass the programatic name of the element class we
       * need to create a new instance of.
       * @param {string=} optCssClass the name of the CSS class elements of this
       * type will have.
       */
      upgradeDom: function(optJsClass, optCssClass) {},
      /**
       * Upgrades a specific element rather than all in the DOM.
       *
       * @param {!Element} element The element we wish to upgrade.
       * @param {string=} optJsClass Optional name of the class we want to upgrade
       * the element to.
       */
      upgradeElement: function(element, optJsClass) {},
      /**
       * Upgrades a specific list of elements rather than all in the DOM.
       *
       * @param {!Element|!Array<!Element>|!NodeList|!HTMLCollection} elements
       * The elements we wish to upgrade.
       */
      upgradeElements: function(elements) {},
      /**
       * Upgrades all registered components found in the current DOM. This is
       * automatically called on window load.
       */
      upgradeAllRegistered: function() {},
      /**
       * Allows user to be alerted to any upgrades that are performed for a given
       * component type
       *
       * @param {string} jsClass The class name of the MDL component we wish
       * to hook into for any upgrades performed.
       * @param {function(!HTMLElement)} callback The function to call upon an
       * upgrade. This function should expect 1 parameter - the HTMLElement which
       * got upgraded.
       */
      registerUpgradedCallback: function(jsClass, callback) {},
      /**
       * Registers a class for future use and attempts to upgrade existing DOM.
       *
       * @param {componentHandler.ComponentConfigPublic} config the registration configuration
       */
      register: function(config) {},
      /**
       * Downgrade either a given node, an array of nodes, or a NodeList.
       *
       * @param {!Node|!Array<!Node>|!NodeList} nodes
       */
      downgradeElements: function(nodes) {}
    };

    componentHandler$1 = (function() {

      /** @type {!Array<componentHandler.ComponentConfig>} */
      var registeredComponents_ = [];

      /** @type {!Array<componentHandler.Component>} */
      var createdComponents_ = [];

      var componentConfigProperty_ = 'mdlComponentConfigInternal_';

      /**
       * Searches registered components for a class we are interested in using.
       * Optionally replaces a match with passed object if specified.
       *
       * @param {string} name The name of a class we want to use.
       * @param {componentHandler.ComponentConfig=} optReplace Optional object to replace match with.
       * @return {!Object|boolean}
       * @private
       */
      function findRegisteredClass_(name, optReplace) {
        for (var i = 0; i < registeredComponents_.length; i++) {
          if (registeredComponents_[i].className === name) {
            if (typeof optReplace !== 'undefined') {
              registeredComponents_[i] = optReplace;
            }
            return registeredComponents_[i];
          }
        }
        return false;
      }

      /**
       * Returns an array of the classNames of the upgraded classes on the element.
       *
       * @param {!Element} element The element to fetch data from.
       * @return {!Array<string>}
       * @private
       */
      function getUpgradedListOfElement_(element) {
        var dataUpgraded = element.getAttribute('data-upgraded');
        // Use `['']` as default value to conform the `,name,name...` style.
        return dataUpgraded === null ? [''] : dataUpgraded.split(',');
      }

      /**
       * Returns true if the given element has already been upgraded for the given
       * class.
       *
       * @param {!Element} element The element we want to check.
       * @param {string} jsClass The class to check for.
       * @returns {boolean}
       * @private
       */
      function isElementUpgraded_(element, jsClass) {
        var upgradedList = getUpgradedListOfElement_(element);
        return upgradedList.indexOf(jsClass) !== -1;
      }

      /**
       * Create an event object.
       *
       * @param {string} eventType The type name of the event.
       * @param {boolean} bubbles Whether the event should bubble up the DOM.
       * @param {boolean} cancelable Whether the event can be canceled.
       * @returns {!Event}
       */
      function createEvent_(eventType, bubbles, cancelable) {
        if ('CustomEvent' in window && typeof window.CustomEvent === 'function') {
          return new CustomEvent(eventType, {
            bubbles: bubbles,
            cancelable: cancelable
          });
        } else {
          var ev = document.createEvent('Events');
          ev.initEvent(eventType, bubbles, cancelable);
          return ev;
        }
      }

      /**
       * Searches existing DOM for elements of our component type and upgrades them
       * if they have not already been upgraded.
       *
       * @param {string=} optJsClass the programatic name of the element class we
       * need to create a new instance of.
       * @param {string=} optCssClass the name of the CSS class elements of this
       * type will have.
       */
      function upgradeDomInternal(optJsClass, optCssClass) {
        if (typeof optJsClass === 'undefined' &&
            typeof optCssClass === 'undefined') {
          for (var i = 0; i < registeredComponents_.length; i++) {
            upgradeDomInternal(registeredComponents_[i].className,
                registeredComponents_[i].cssClass);
          }
        } else {
          var jsClass = /** @type {string} */ (optJsClass);
          if (typeof optCssClass === 'undefined') {
            var registeredClass = findRegisteredClass_(jsClass);
            if (registeredClass) {
              optCssClass = registeredClass.cssClass;
            }
          }

          var elements = document.querySelectorAll('.' + optCssClass);
          for (var n = 0; n < elements.length; n++) {
            upgradeElementInternal(elements[n], jsClass);
          }
        }
      }

      /**
       * Upgrades a specific element rather than all in the DOM.
       *
       * @param {!Element} element The element we wish to upgrade.
       * @param {string=} optJsClass Optional name of the class we want to upgrade
       * the element to.
       */
      function upgradeElementInternal(element, optJsClass) {
        // Verify argument type.
        if (!(typeof element === 'object' && element instanceof Element)) {
          throw new Error('Invalid argument provided to upgrade MDL element.');
        }
        // Allow upgrade to be canceled by canceling emitted event.
        var upgradingEv = createEvent_('mdl-componentupgrading', true, true);
        element.dispatchEvent(upgradingEv);
        if (upgradingEv.defaultPrevented) {
          return;
        }

        var upgradedList = getUpgradedListOfElement_(element);
        var classesToUpgrade = [];
        // If jsClass is not provided scan the registered components to find the
        // ones matching the element's CSS classList.
        if (!optJsClass) {
          var classList = element.classList;
          registeredComponents_.forEach(function(component) {
            // Match CSS & Not to be upgraded & Not upgraded.
            if (classList.contains(component.cssClass) &&
                classesToUpgrade.indexOf(component) === -1 &&
                !isElementUpgraded_(element, component.className)) {
              classesToUpgrade.push(component);
            }
          });
        } else if (!isElementUpgraded_(element, optJsClass)) {
          classesToUpgrade.push(findRegisteredClass_(optJsClass));
        }

        // Upgrade the element for each classes.
        for (var i = 0, n = classesToUpgrade.length, registeredClass; i < n; i++) {
          registeredClass = classesToUpgrade[i];
          if (registeredClass) {
            // Mark element as upgraded.
            upgradedList.push(registeredClass.className);
            element.setAttribute('data-upgraded', upgradedList.join(','));
            var instance = new registeredClass.classConstructor(element);
            instance[componentConfigProperty_] = registeredClass;
            createdComponents_.push(instance);
            // Call any callbacks the user has registered with this component type.
            for (var j = 0, m = registeredClass.callbacks.length; j < m; j++) {
              registeredClass.callbacks[j](element);
            }

            if (registeredClass.widget) {
              // Assign per element instance for control over API
              element[registeredClass.className] = instance;
            }
          } else {
            throw new Error(
              'Unable to find a registered component for the given class.');
          }

          var upgradedEv = createEvent_('mdl-componentupgraded', true, false);
          element.dispatchEvent(upgradedEv);
        }
      }

      /**
       * Upgrades a specific list of elements rather than all in the DOM.
       *
       * @param {!Element|!Array<!Element>|!NodeList|!HTMLCollection} elements
       * The elements we wish to upgrade.
       */
      function upgradeElementsInternal(elements) {
        if (!Array.isArray(elements)) {
          if (elements instanceof Element) {
            elements = [elements];
          } else {
            elements = Array.prototype.slice.call(elements);
          }
        }
        for (var i = 0, n = elements.length, element; i < n; i++) {
          element = elements[i];
          if (element instanceof HTMLElement) {
            upgradeElementInternal(element);
            if (element.children.length > 0) {
              upgradeElementsInternal(element.children);
            }
          }
        }
      }

      /**
       * Registers a class for future use and attempts to upgrade existing DOM.
       *
       * @param {componentHandler.ComponentConfigPublic} config
       */
      function registerInternal(config) {
        // In order to support both Closure-compiled and uncompiled code accessing
        // this method, we need to allow for both the dot and array syntax for
        // property access. You'll therefore see the `foo.bar || foo['bar']`
        // pattern repeated across this method.
        var widgetMissing = (typeof config.widget === 'undefined' &&
            typeof config['widget'] === 'undefined');
        var widget = true;

        if (!widgetMissing) {
          widget = config.widget || config['widget'];
        }

        var newConfig = /** @type {componentHandler.ComponentConfig} */ ({
          classConstructor: config.constructor || config['constructor'],
          className: config.classAsString || config['classAsString'],
          cssClass: config.cssClass || config['cssClass'],
          widget: widget,
          callbacks: []
        });

        registeredComponents_.forEach(function(item) {
          if (item.cssClass === newConfig.cssClass) {
            throw new Error('The provided cssClass has already been registered: ' + item.cssClass);
          }
          if (item.className === newConfig.className) {
            throw new Error('The provided className has already been registered');
          }
        });

        if (config.constructor.prototype
            .hasOwnProperty(componentConfigProperty_)) {
          throw new Error(
              'MDL component classes must not have ' + componentConfigProperty_ +
              ' defined as a property.');
        }

        var found = findRegisteredClass_(config.classAsString, newConfig);

        if (!found) {
          registeredComponents_.push(newConfig);
        }
      }

      /**
       * Allows user to be alerted to any upgrades that are performed for a given
       * component type
       *
       * @param {string} jsClass The class name of the MDL component we wish
       * to hook into for any upgrades performed.
       * @param {function(!HTMLElement)} callback The function to call upon an
       * upgrade. This function should expect 1 parameter - the HTMLElement which
       * got upgraded.
       */
      function registerUpgradedCallbackInternal(jsClass, callback) {
        var regClass = findRegisteredClass_(jsClass);
        if (regClass) {
          regClass.callbacks.push(callback);
        }
      }

      /**
       * Upgrades all registered components found in the current DOM. This is
       * automatically called on window load.
       */
      function upgradeAllRegisteredInternal() {
        for (var n = 0; n < registeredComponents_.length; n++) {
          upgradeDomInternal(registeredComponents_[n].className);
        }
      }

      /**
       * Check the component for the downgrade method.
       * Execute if found.
       * Remove component from createdComponents list.
       *
       * @param {?componentHandler.Component} component
       */
      function deconstructComponentInternal(component) {
        if (component) {
          var componentIndex = createdComponents_.indexOf(component);
          createdComponents_.splice(componentIndex, 1);

          var upgrades = component.element_.getAttribute('data-upgraded').split(',');
          var componentPlace = upgrades.indexOf(component[componentConfigProperty_].classAsString);
          upgrades.splice(componentPlace, 1);
          component.element_.setAttribute('data-upgraded', upgrades.join(','));

          var ev = createEvent_('mdl-componentdowngraded', true, false);
          component.element_.dispatchEvent(ev);
        }
      }

      /**
       * Downgrade either a given node, an array of nodes, or a NodeList.
       *
       * @param {!Node|!Array<!Node>|!NodeList} nodes
       */
      function downgradeNodesInternal(nodes) {
        /**
         * Auxiliary function to downgrade a single node.
         * @param  {!Node} node the node to be downgraded
         */
        var downgradeNode = function(node) {
          createdComponents_.filter(function(item) {
            return item.element_ === node;
          }).forEach(deconstructComponentInternal);
        };
        if (nodes instanceof Array || nodes instanceof NodeList) {
          for (var n = 0; n < nodes.length; n++) {
            downgradeNode(nodes[n]);
          }
        } else if (nodes instanceof Node) {
          downgradeNode(nodes);
        } else {
          throw new Error('Invalid argument provided to downgrade MDL nodes.');
        }
      }

      // Now return the functions that should be made public with their publicly
      // facing names...
      return {
        upgradeDom: upgradeDomInternal,
        upgradeElement: upgradeElementInternal,
        upgradeElements: upgradeElementsInternal,
        upgradeAllRegistered: upgradeAllRegisteredInternal,
        registerUpgradedCallback: registerUpgradedCallbackInternal,
        register: registerInternal,
        downgradeElements: downgradeNodesInternal
      };
    })();

    /**
     * Describes the type of a registered component type managed by
     * componentHandler. Provided for benefit of the Closure compiler.
     *
     * @typedef {{
     *   constructor: Function,
     *   classAsString: string,
     *   cssClass: string,
     *   widget: (string|boolean|undefined)
     * }}
     */
    componentHandler$1.ComponentConfigPublic;  // jshint ignore:line

    /**
     * Describes the type of a registered component type managed by
     * componentHandler. Provided for benefit of the Closure compiler.
     *
     * @typedef {{
     *   constructor: !Function,
     *   className: string,
     *   cssClass: string,
     *   widget: (string|boolean),
     *   callbacks: !Array<function(!HTMLElement)>
     * }}
     */
    componentHandler$1.ComponentConfig;  // jshint ignore:line

    /**
     * Created component (i.e., upgraded element) type as managed by
     * componentHandler. Provided for benefit of the Closure compiler.
     *
     * @typedef {{
     *   element_: !HTMLElement,
     *   className: string,
     *   classAsString: string,
     *   cssClass: string,
     *   widget: string
     * }}
     */
    componentHandler$1.Component;  // jshint ignore:line

    // Export all symbols, for the benefit of Closure compiler.
    // No effect on uncompiled code.
    componentHandler$1['upgradeDom'] = componentHandler$1.upgradeDom;
    componentHandler$1['upgradeElement'] = componentHandler$1.upgradeElement;
    componentHandler$1['upgradeElements'] = componentHandler$1.upgradeElements;
    componentHandler$1['upgradeAllRegistered'] =
        componentHandler$1.upgradeAllRegistered;
    componentHandler$1['registerUpgradedCallback'] =
        componentHandler$1.registerUpgradedCallback;
    componentHandler$1['register'] = componentHandler$1.register;
    componentHandler$1['downgradeElements'] = componentHandler$1.downgradeElements;
    window.componentHandler = componentHandler$1;
    window['componentHandler'] = componentHandler$1;

    window.addEventListener('load', function() {

      /**
       * Performs a "Cutting the mustard" test. If the browser supports the features
       * tested, adds a mdl-js class to the <html> element. It then upgrades all MDL
       * components requiring JavaScript.
       */
      if ('classList' in document.createElement('div') &&
          'querySelector' in document &&
          'addEventListener' in window && Array.prototype.forEach) {
        document.documentElement.classList.add('mdl-js');
        componentHandler$1.upgradeAllRegistered();
      } else {
        /**
         * Dummy function to avoid JS errors.
         */
        componentHandler$1.upgradeElement = function() {};
        /**
         * Dummy function to avoid JS errors.
         */
        componentHandler$1.register = function() {};
      }
    });

    /**
     * @license
     * Copyright 2015 Google Inc. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function() {

      /**
       * Class constructor for Button MDL component.
       * Implements MDL component design pattern defined at:
       * https://github.com/jasonmayes/mdl-component-design-pattern
       *
       * @param {HTMLElement} element The element that will be upgraded.
       */
      var MaterialButton = function MaterialButton(element) {
        this.element_ = element;

        // Initialize instance.
        this.init();
      };
      window['MaterialButton'] = MaterialButton;

      /**
       * Store constants in one place so they can be updated easily.
       *
       * @enum {string | number}
       * @private
       */
      MaterialButton.prototype.Constant_ = {
        // None for now.
      };

      /**
       * Store strings for class names defined by this component that are used in
       * JavaScript. This allows us to simply change it in one place should we
       * decide to modify at a later date.
       *
       * @enum {string}
       * @private
       */
      MaterialButton.prototype.CssClasses_ = {
        RIPPLE_EFFECT: 'mdl-js-ripple-effect',
        RIPPLE_CONTAINER: 'mdl-button__ripple-container',
        RIPPLE: 'mdl-ripple'
      };

      /**
       * Handle blur of element.
       *
       * @param {Event} event The event that fired.
       * @private
       */
      MaterialButton.prototype.blurHandler_ = function(event) {
        if (event) {
          this.element_.blur();
        }
      };

      // Public methods.

      /**
       * Disable button.
       *
       * @public
       */
      MaterialButton.prototype.disable = function() {
        this.element_.disabled = true;
      };
      MaterialButton.prototype['disable'] = MaterialButton.prototype.disable;

      /**
       * Enable button.
       *
       * @public
       */
      MaterialButton.prototype.enable = function() {
        this.element_.disabled = false;
      };
      MaterialButton.prototype['enable'] = MaterialButton.prototype.enable;

      /**
       * Initialize element.
       */
      MaterialButton.prototype.init = function() {
        if (this.element_) {
          if (this.element_.classList.contains(this.CssClasses_.RIPPLE_EFFECT)) {
            var rippleContainer = document.createElement('span');
            rippleContainer.classList.add(this.CssClasses_.RIPPLE_CONTAINER);
            this.rippleElement_ = document.createElement('span');
            this.rippleElement_.classList.add(this.CssClasses_.RIPPLE);
            rippleContainer.appendChild(this.rippleElement_);
            this.boundRippleBlurHandler = this.blurHandler_.bind(this);
            this.rippleElement_.addEventListener('mouseup', this.boundRippleBlurHandler);
            this.element_.appendChild(rippleContainer);
          }
          this.boundButtonBlurHandler = this.blurHandler_.bind(this);
          this.element_.addEventListener('mouseup', this.boundButtonBlurHandler);
          this.element_.addEventListener('mouseleave', this.boundButtonBlurHandler);
        }
      };

      // The component registers itself. It can assume componentHandler is available
      // in the global scope.
      componentHandler.register({
        constructor: MaterialButton,
        classAsString: 'MaterialButton',
        cssClass: 'mdl-js-button',
        widget: true
      });
    })();

    /**
     * @license
     * Copyright 2015 Google Inc. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function() {

      /**
       * Class constructor for Progress MDL component.
       * Implements MDL component design pattern defined at:
       * https://github.com/jasonmayes/mdl-component-design-pattern
       *
       * @constructor
       * @param {HTMLElement} element The element that will be upgraded.
       */
      var MaterialProgress = function MaterialProgress(element) {
        this.element_ = element;

        // Initialize instance.
        this.init();
      };
      window['MaterialProgress'] = MaterialProgress;

      /**
       * Store constants in one place so they can be updated easily.
       *
       * @enum {string | number}
       * @private
       */
      MaterialProgress.prototype.Constant_ = {
      };

      /**
       * Store strings for class names defined by this component that are used in
       * JavaScript. This allows us to simply change it in one place should we
       * decide to modify at a later date.
       *
       * @enum {string}
       * @private
       */
      MaterialProgress.prototype.CssClasses_ = {
        INDETERMINATE_CLASS: 'mdl-progress__indeterminate'
      };

      /**
       * Set the current progress of the progressbar.
       *
       * @param {number} p Percentage of the progress (0-100)
       * @public
       */
      MaterialProgress.prototype.setProgress = function(p) {
        if (this.element_.classList.contains(this.CssClasses_.INDETERMINATE_CLASS)) {
          return;
        }

        this.progressbar_.style.width = p + '%';
      };
      MaterialProgress.prototype['setProgress'] =
          MaterialProgress.prototype.setProgress;

      /**
       * Set the current progress of the buffer.
       *
       * @param {number} p Percentage of the buffer (0-100)
       * @public
       */
      MaterialProgress.prototype.setBuffer = function(p) {
        this.bufferbar_.style.width = p + '%';
        this.auxbar_.style.width = (100 - p) + '%';
      };
      MaterialProgress.prototype['setBuffer'] =
          MaterialProgress.prototype.setBuffer;

      /**
       * Initialize element.
       */
      MaterialProgress.prototype.init = function() {
        if (this.element_) {
          var el = document.createElement('div');
          el.className = 'progressbar bar bar1';
          this.element_.appendChild(el);
          this.progressbar_ = el;

          el = document.createElement('div');
          el.className = 'bufferbar bar bar2';
          this.element_.appendChild(el);
          this.bufferbar_ = el;

          el = document.createElement('div');
          el.className = 'auxbar bar bar3';
          this.element_.appendChild(el);
          this.auxbar_ = el;

          this.progressbar_.style.width = '0%';
          this.bufferbar_.style.width = '100%';
          this.auxbar_.style.width = '0%';

          this.element_.classList.add('is-upgraded');
        }
      };

      // The component registers itself. It can assume componentHandler is available
      // in the global scope.
      componentHandler.register({
        constructor: MaterialProgress,
        classAsString: 'MaterialProgress',
        cssClass: 'mdl-js-progress',
        widget: true
      });
    })();

    /**
     * @license
     * Copyright 2015 Google Inc. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function() {

      /**
       * Class constructor for Spinner MDL component.
       * Implements MDL component design pattern defined at:
       * https://github.com/jasonmayes/mdl-component-design-pattern
       *
       * @param {HTMLElement} element The element that will be upgraded.
       * @constructor
       */
      var MaterialSpinner = function MaterialSpinner(element) {
        this.element_ = element;

        // Initialize instance.
        this.init();
      };
      window['MaterialSpinner'] = MaterialSpinner;

      /**
       * Store constants in one place so they can be updated easily.
       *
       * @enum {string | number}
       * @private
       */
      MaterialSpinner.prototype.Constant_ = {
        MDL_SPINNER_LAYER_COUNT: 4
      };

      /**
       * Store strings for class names defined by this component that are used in
       * JavaScript. This allows us to simply change it in one place should we
       * decide to modify at a later date.
       *
       * @enum {string}
       * @private
       */
      MaterialSpinner.prototype.CssClasses_ = {
        MDL_SPINNER_LAYER: 'mdl-spinner__layer',
        MDL_SPINNER_CIRCLE_CLIPPER: 'mdl-spinner__circle-clipper',
        MDL_SPINNER_CIRCLE: 'mdl-spinner__circle',
        MDL_SPINNER_GAP_PATCH: 'mdl-spinner__gap-patch',
        MDL_SPINNER_LEFT: 'mdl-spinner__left',
        MDL_SPINNER_RIGHT: 'mdl-spinner__right'
      };

      /**
       * Auxiliary method to create a spinner layer.
       *
       * @param {number} index Index of the layer to be created.
       * @public
       */
      MaterialSpinner.prototype.createLayer = function(index) {
        var layer = document.createElement('div');
        layer.classList.add(this.CssClasses_.MDL_SPINNER_LAYER);
        layer.classList.add(this.CssClasses_.MDL_SPINNER_LAYER + '-' + index);

        var leftClipper = document.createElement('div');
        leftClipper.classList.add(this.CssClasses_.MDL_SPINNER_CIRCLE_CLIPPER);
        leftClipper.classList.add(this.CssClasses_.MDL_SPINNER_LEFT);

        var gapPatch = document.createElement('div');
        gapPatch.classList.add(this.CssClasses_.MDL_SPINNER_GAP_PATCH);

        var rightClipper = document.createElement('div');
        rightClipper.classList.add(this.CssClasses_.MDL_SPINNER_CIRCLE_CLIPPER);
        rightClipper.classList.add(this.CssClasses_.MDL_SPINNER_RIGHT);

        var circleOwners = [leftClipper, gapPatch, rightClipper];

        for (var i = 0; i < circleOwners.length; i++) {
          var circle = document.createElement('div');
          circle.classList.add(this.CssClasses_.MDL_SPINNER_CIRCLE);
          circleOwners[i].appendChild(circle);
        }

        layer.appendChild(leftClipper);
        layer.appendChild(gapPatch);
        layer.appendChild(rightClipper);

        this.element_.appendChild(layer);
      };
      MaterialSpinner.prototype['createLayer'] =
          MaterialSpinner.prototype.createLayer;

      /**
       * Stops the spinner animation.
       * Public method for users who need to stop the spinner for any reason.
       *
       * @public
       */
      MaterialSpinner.prototype.stop = function() {
        this.element_.classList.remove('is-active');
      };
      MaterialSpinner.prototype['stop'] = MaterialSpinner.prototype.stop;

      /**
       * Starts the spinner animation.
       * Public method for users who need to manually start the spinner for any reason
       * (instead of just adding the 'is-active' class to their markup).
       *
       * @public
       */
      MaterialSpinner.prototype.start = function() {
        this.element_.classList.add('is-active');
      };
      MaterialSpinner.prototype['start'] = MaterialSpinner.prototype.start;

      /**
       * Initialize element.
       */
      MaterialSpinner.prototype.init = function() {
        if (this.element_) {
          for (var i = 1; i <= this.Constant_.MDL_SPINNER_LAYER_COUNT; i++) {
            this.createLayer(i);
          }

          this.element_.classList.add('is-upgraded');
        }
      };

      // The component registers itself. It can assume componentHandler is available
      // in the global scope.
      componentHandler.register({
        constructor: MaterialSpinner,
        classAsString: 'MaterialSpinner',
        cssClass: 'mdl-js-spinner',
        widget: true
      });
    })();

    /**
     * @license
     * Copyright 2015 Google Inc. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    (function() {

      /**
       * Class constructor for Textfield MDL component.
       * Implements MDL component design pattern defined at:
       * https://github.com/jasonmayes/mdl-component-design-pattern
       *
       * @constructor
       * @param {HTMLElement} element The element that will be upgraded.
       */
      var MaterialTextfield = function MaterialTextfield(element) {
        this.element_ = element;
        this.maxRows = this.Constant_.NO_MAX_ROWS;
        // Initialize instance.
        this.init();
      };
      window['MaterialTextfield'] = MaterialTextfield;

      /**
       * Store constants in one place so they can be updated easily.
       *
       * @enum {string | number}
       * @private
       */
      MaterialTextfield.prototype.Constant_ = {
        NO_MAX_ROWS: -1,
        MAX_ROWS_ATTRIBUTE: 'maxrows'
      };

      /**
       * Store strings for class names defined by this component that are used in
       * JavaScript. This allows us to simply change it in one place should we
       * decide to modify at a later date.
       *
       * @enum {string}
       * @private
       */
      MaterialTextfield.prototype.CssClasses_ = {
        LABEL: 'mdl-textfield__label',
        INPUT: 'mdl-textfield__input',
        IS_DIRTY: 'is-dirty',
        IS_FOCUSED: 'is-focused',
        IS_DISABLED: 'is-disabled',
        IS_INVALID: 'is-invalid',
        IS_UPGRADED: 'is-upgraded',
        HAS_PLACEHOLDER: 'has-placeholder'
      };

      /**
       * Handle input being entered.
       *
       * @param {Event} event The event that fired.
       * @private
       */
      MaterialTextfield.prototype.onKeyDown_ = function(event) {
        var currentRowCount = event.target.value.split('\n').length;
        if (event.keyCode === 13) {
          if (currentRowCount >= this.maxRows) {
            event.preventDefault();
          }
        }
      };

      /**
       * Handle focus.
       *
       * @param {Event} event The event that fired.
       * @private
       */
      MaterialTextfield.prototype.onFocus_ = function(event) {
        this.element_.classList.add(this.CssClasses_.IS_FOCUSED);
      };

      /**
       * Handle lost focus.
       *
       * @param {Event} event The event that fired.
       * @private
       */
      MaterialTextfield.prototype.onBlur_ = function(event) {
        this.element_.classList.remove(this.CssClasses_.IS_FOCUSED);
      };

      /**
       * Handle reset event from out side.
       *
       * @param {Event} event The event that fired.
       * @private
       */
      MaterialTextfield.prototype.onReset_ = function(event) {
        this.updateClasses_();
      };

      /**
       * Handle class updates.
       *
       * @private
       */
      MaterialTextfield.prototype.updateClasses_ = function() {
        this.checkDisabled();
        this.checkValidity();
        this.checkDirty();
        this.checkFocus();
      };

      // Public methods.

      /**
       * Check the disabled state and update field accordingly.
       *
       * @public
       */
      MaterialTextfield.prototype.checkDisabled = function() {
        if (this.input_.disabled) {
          this.element_.classList.add(this.CssClasses_.IS_DISABLED);
        } else {
          this.element_.classList.remove(this.CssClasses_.IS_DISABLED);
        }
      };
      MaterialTextfield.prototype['checkDisabled'] =
          MaterialTextfield.prototype.checkDisabled;

      /**
      * Check the focus state and update field accordingly.
      *
      * @public
      */
      MaterialTextfield.prototype.checkFocus = function() {
        if (Boolean(this.element_.querySelector(':focus'))) {
          this.element_.classList.add(this.CssClasses_.IS_FOCUSED);
        } else {
          this.element_.classList.remove(this.CssClasses_.IS_FOCUSED);
        }
      };
      MaterialTextfield.prototype['checkFocus'] =
        MaterialTextfield.prototype.checkFocus;

      /**
       * Check the validity state and update field accordingly.
       *
       * @public
       */
      MaterialTextfield.prototype.checkValidity = function() {
        if (this.input_.validity) {
          if (this.input_.validity.valid) {
            this.element_.classList.remove(this.CssClasses_.IS_INVALID);
          } else {
            this.element_.classList.add(this.CssClasses_.IS_INVALID);
          }
        }
      };
      MaterialTextfield.prototype['checkValidity'] =
          MaterialTextfield.prototype.checkValidity;

      /**
       * Check the dirty state and update field accordingly.
       *
       * @public
       */
      MaterialTextfield.prototype.checkDirty = function() {
        if (this.input_.value && this.input_.value.length > 0) {
          this.element_.classList.add(this.CssClasses_.IS_DIRTY);
        } else {
          this.element_.classList.remove(this.CssClasses_.IS_DIRTY);
        }
      };
      MaterialTextfield.prototype['checkDirty'] =
          MaterialTextfield.prototype.checkDirty;

      /**
       * Disable text field.
       *
       * @public
       */
      MaterialTextfield.prototype.disable = function() {
        this.input_.disabled = true;
        this.updateClasses_();
      };
      MaterialTextfield.prototype['disable'] = MaterialTextfield.prototype.disable;

      /**
       * Enable text field.
       *
       * @public
       */
      MaterialTextfield.prototype.enable = function() {
        this.input_.disabled = false;
        this.updateClasses_();
      };
      MaterialTextfield.prototype['enable'] = MaterialTextfield.prototype.enable;

      /**
       * Update text field value.
       *
       * @param {string} value The value to which to set the control (optional).
       * @public
       */
      MaterialTextfield.prototype.change = function(value) {

        this.input_.value = value || '';
        this.updateClasses_();
      };
      MaterialTextfield.prototype['change'] = MaterialTextfield.prototype.change;

      /**
       * Initialize element.
       */
      MaterialTextfield.prototype.init = function() {

        if (this.element_) {
          this.label_ = this.element_.querySelector('.' + this.CssClasses_.LABEL);
          this.input_ = this.element_.querySelector('.' + this.CssClasses_.INPUT);

          if (this.input_) {
            if (this.input_.hasAttribute(
                  /** @type {string} */ (this.Constant_.MAX_ROWS_ATTRIBUTE))) {
              this.maxRows = parseInt(this.input_.getAttribute(
                  /** @type {string} */ (this.Constant_.MAX_ROWS_ATTRIBUTE)), 10);
              if (isNaN(this.maxRows)) {
                this.maxRows = this.Constant_.NO_MAX_ROWS;
              }
            }

            if (this.input_.hasAttribute('placeholder')) {
              this.element_.classList.add(this.CssClasses_.HAS_PLACEHOLDER);
            }

            this.boundUpdateClassesHandler = this.updateClasses_.bind(this);
            this.boundFocusHandler = this.onFocus_.bind(this);
            this.boundBlurHandler = this.onBlur_.bind(this);
            this.boundResetHandler = this.onReset_.bind(this);
            this.input_.addEventListener('input', this.boundUpdateClassesHandler);
            this.input_.addEventListener('focus', this.boundFocusHandler);
            this.input_.addEventListener('blur', this.boundBlurHandler);
            this.input_.addEventListener('reset', this.boundResetHandler);

            if (this.maxRows !== this.Constant_.NO_MAX_ROWS) {
              // TODO: This should handle pasting multi line text.
              // Currently doesn't.
              this.boundKeyDownHandler = this.onKeyDown_.bind(this);
              this.input_.addEventListener('keydown', this.boundKeyDownHandler);
            }
            var invalid = this.element_.classList
              .contains(this.CssClasses_.IS_INVALID);
            this.updateClasses_();
            this.element_.classList.add(this.CssClasses_.IS_UPGRADED);
            if (invalid) {
              this.element_.classList.add(this.CssClasses_.IS_INVALID);
            }
            if (this.input_.hasAttribute('autofocus')) {
              this.element_.focus();
              this.checkFocus();
            }
          }
        }
      };

      // The component registers itself. It can assume componentHandler is available
      // in the global scope.
      componentHandler.register({
        constructor: MaterialTextfield,
        classAsString: 'MaterialTextfield',
        cssClass: 'mdl-js-textfield',
        widget: true
      });
    })();

    (function() {(function(){var l,aa="function"==typeof Object.create?Object.create:function(a){function b(){}b.prototype=a;return new b},ba;if("function"==typeof Object.setPrototypeOf)ba=Object.setPrototypeOf;else {var ca;a:{var da={xb:!0},ea={};try{ea.__proto__=da;ca=ea.xb;break a}catch(a){}ca=!1;}ba=ca?function(a,b){a.__proto__=b;if(a.__proto__!==b)throw new TypeError(a+" is not extensible");return a}:null;}var fa=ba;function m(a,b){a.prototype=aa(b.prototype);a.prototype.constructor=a;if(fa)fa(a,b);else for(var c in b)if("prototype"!=
    c)if(Object.defineProperties){var d=Object.getOwnPropertyDescriptor(b,c);d&&Object.defineProperty(a,c,d);}else a[c]=b[c];a.K=b.prototype;}var ha="function"==typeof Object.defineProperties?Object.defineProperty:function(a,b,c){a!=Array.prototype&&a!=Object.prototype&&(a[b]=c.value);},ia="undefined"!=typeof window&&window===this?this:"undefined"!=typeof global&&null!=global?global:this;function ja(a,b){if(b){var c=ia;a=a.split(".");for(var d=0;d<a.length-1;d++){var e=a[d];e in c||(c[e]={});c=c[e];}a=a[a.length-
    1];d=c[a];b=b(d);b!=d&&null!=b&&ha(c,a,{configurable:!0,writable:!0,value:b});}}ja("Object.is",function(a){return a?a:function(b,c){return b===c?0!==b||1/b===1/c:b!==b&&c!==c}});ja("Array.prototype.includes",function(a){return a?a:function(b,c){var d=this;d instanceof String&&(d=String(d));var e=d.length;c=c||0;for(0>c&&(c=Math.max(c+e,0));c<e;c++){var f=d[c];if(f===b||Object.is(f,b))return !0}return !1}});var n=this;function ka(a){return void 0!==a}function q(a){return "string"==typeof a}var la=/^[\w+/_-]+[=]{0,2}$/,
    ma=null;function na(){}function oa(a){a.W=void 0;a.Xa=function(){return a.W?a.W:a.W=new a};}function pa(a){var b=typeof a;if("object"==b)if(a){if(a instanceof Array)return "array";if(a instanceof Object)return b;var c=Object.prototype.toString.call(a);if("[object Window]"==c)return "object";if("[object Array]"==c||"number"==typeof a.length&&"undefined"!=typeof a.splice&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("splice"))return "array";if("[object Function]"==c||"undefined"!=
    typeof a.call&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("call"))return "function"}else return "null";else if("function"==b&&"undefined"==typeof a.call)return "object";return b}function qa(a){return "array"==pa(a)}function ra(a){var b=pa(a);return "array"==b||"object"==b&&"number"==typeof a.length}function sa(a){return "function"==pa(a)}function ta(a){var b=typeof a;return "object"==b&&null!=a||"function"==b}var ua="closure_uid_"+(1E9*Math.random()>>>0),va=0;function wa(a,b,c){return a.call.apply(a.bind,
    arguments)}function ya(a,b,c){if(!a)throw Error();if(2<arguments.length){var d=Array.prototype.slice.call(arguments,2);return function(){var e=Array.prototype.slice.call(arguments);Array.prototype.unshift.apply(e,d);return a.apply(b,e)}}return function(){return a.apply(b,arguments)}}function t(a,b,c){Function.prototype.bind&&-1!=Function.prototype.bind.toString().indexOf("native code")?t=wa:t=ya;return t.apply(null,arguments)}function za(a,b){var c=Array.prototype.slice.call(arguments,1);return function(){var d=
    c.slice();d.push.apply(d,arguments);return a.apply(this,d)}}function u(a,b){for(var c in b)a[c]=b[c];}var Aa=Date.now||function(){return +new Date};function v(a,b){a=a.split(".");var c=n;a[0]in c||"undefined"==typeof c.execScript||c.execScript("var "+a[0]);for(var d;a.length&&(d=a.shift());)!a.length&&ka(b)?c[d]=b:c[d]&&c[d]!==Object.prototype[d]?c=c[d]:c=c[d]={};}function w(a,b){function c(){}c.prototype=b.prototype;a.K=b.prototype;a.prototype=new c;a.prototype.constructor=a;a.tc=function(d,e,f){for(var g=
    Array(arguments.length-2),h=2;h<arguments.length;h++)g[h-2]=arguments[h];return b.prototype[e].apply(d,g)};}function Ca(a){if(Error.captureStackTrace)Error.captureStackTrace(this,Ca);else {var b=Error().stack;b&&(this.stack=b);}a&&(this.message=String(a));}w(Ca,Error);Ca.prototype.name="CustomError";var Da;function Ea(a,b){a=a.split("%s");for(var c="",d=a.length-1,e=0;e<d;e++)c+=a[e]+(e<b.length?b[e]:"%s");Ca.call(this,c+a[d]);}w(Ea,Ca);Ea.prototype.name="AssertionError";function Fa(a,b){throw new Ea("Failure"+
    (a?": "+a:""),Array.prototype.slice.call(arguments,1));}var Ga=Array.prototype.indexOf?function(a,b){return Array.prototype.indexOf.call(a,b,void 0)}:function(a,b){if(q(a))return q(b)&&1==b.length?a.indexOf(b,0):-1;for(var c=0;c<a.length;c++)if(c in a&&a[c]===b)return c;return -1},Ha=Array.prototype.forEach?function(a,b,c){Array.prototype.forEach.call(a,b,c);}:function(a,b,c){for(var d=a.length,e=q(a)?a.split(""):a,f=0;f<d;f++)f in e&&b.call(c,e[f],f,a);};function Ia(a,b){for(var c=q(a)?a.split(""):
    a,d=a.length-1;0<=d;--d)d in c&&b.call(void 0,c[d],d,a);}var Ja=Array.prototype.filter?function(a,b){return Array.prototype.filter.call(a,b,void 0)}:function(a,b){for(var c=a.length,d=[],e=0,f=q(a)?a.split(""):a,g=0;g<c;g++)if(g in f){var h=f[g];b.call(void 0,h,g,a)&&(d[e++]=h);}return d},Ka=Array.prototype.map?function(a,b){return Array.prototype.map.call(a,b,void 0)}:function(a,b){for(var c=a.length,d=Array(c),e=q(a)?a.split(""):a,f=0;f<c;f++)f in e&&(d[f]=b.call(void 0,e[f],f,a));return d},La=Array.prototype.some?
    function(a,b){return Array.prototype.some.call(a,b,void 0)}:function(a,b){for(var c=a.length,d=q(a)?a.split(""):a,e=0;e<c;e++)if(e in d&&b.call(void 0,d[e],e,a))return !0;return !1};function Ma(a,b){return 0<=Ga(a,b)}function Na(a,b){b=Ga(a,b);var c;(c=0<=b)&&Oa(a,b);return c}function Oa(a,b){return 1==Array.prototype.splice.call(a,b,1).length}function Pa(a,b){a:{for(var c=a.length,d=q(a)?a.split(""):a,e=0;e<c;e++)if(e in d&&b.call(void 0,d[e],e,a)){b=e;break a}b=-1;}0<=b&&Oa(a,b);}function Qa(a,b){var c=
    0;Ia(a,function(d,e){b.call(void 0,d,e,a)&&Oa(a,e)&&c++;});}function Ra(a){return Array.prototype.concat.apply([],arguments)}function Sa(a){var b=a.length;if(0<b){for(var c=Array(b),d=0;d<b;d++)c[d]=a[d];return c}return []}function Ta(a,b,c,d){return Array.prototype.splice.apply(a,Ua(arguments,1))}function Ua(a,b,c){return 2>=arguments.length?Array.prototype.slice.call(a,b):Array.prototype.slice.call(a,b,c)}var Va=String.prototype.trim?function(a){return a.trim()}:function(a){return /^[\s\xa0]*([\s\S]*?)[\s\xa0]*$/.exec(a)[1]},
    Wa=/&/g,Xa=/</g,Ya=/>/g,Za=/"/g,$a=/'/g,ab=/\x00/g,bb=/[\x00&<>"']/;function cb(a,b){return a<b?-1:a>b?1:0}function db(a){bb.test(a)&&(-1!=a.indexOf("&")&&(a=a.replace(Wa,"&amp;")),-1!=a.indexOf("<")&&(a=a.replace(Xa,"&lt;")),-1!=a.indexOf(">")&&(a=a.replace(Ya,"&gt;")),-1!=a.indexOf('"')&&(a=a.replace(Za,"&quot;")),-1!=a.indexOf("'")&&(a=a.replace($a,"&#39;")),-1!=a.indexOf("\x00")&&(a=a.replace(ab,"&#0;")));return a}function eb(a,b,c){for(var d in a)b.call(c,a[d],d,a);}function fb(a){var b={},c;
    for(c in a)b[c]=a[c];return b}var gb="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function hb(a,b){for(var c,d,e=1;e<arguments.length;e++){d=arguments[e];for(c in d)a[c]=d[c];for(var f=0;f<gb.length;f++)c=gb[f],Object.prototype.hasOwnProperty.call(d,c)&&(a[c]=d[c]);}}var ib="StopIteration"in n?n.StopIteration:{message:"StopIteration",stack:""};function jb(){}jb.prototype.next=function(){throw ib;};jb.prototype.ha=function(){return this};
    function kb(a){if(a instanceof jb)return a;if("function"==typeof a.ha)return a.ha(!1);if(ra(a)){var b=0,c=new jb;c.next=function(){for(;;){if(b>=a.length)throw ib;if(b in a)return a[b++];b++;}};return c}throw Error("Not implemented");}function lb(a,b){if(ra(a))try{Ha(a,b,void 0);}catch(c){if(c!==ib)throw c;}else {a=kb(a);try{for(;;)b.call(void 0,a.next(),void 0,a);}catch(c$0){if(c$0!==ib)throw c$0;}}}function mb(a){if(ra(a))return Sa(a);a=kb(a);var b=[];lb(a,function(c){b.push(c);});return b}function nb(a,
    b){this.g={};this.a=[];this.j=this.h=0;var c=arguments.length;if(1<c){if(c%2)throw Error("Uneven number of arguments");for(var d=0;d<c;d+=2)this.set(arguments[d],arguments[d+1]);}else if(a)if(a instanceof nb)for(c=a.ja(),d=0;d<c.length;d++)this.set(c[d],a.get(c[d]));else for(d in a)this.set(d,a[d]);}l=nb.prototype;l.la=function(){ob(this);for(var a=[],b=0;b<this.a.length;b++)a.push(this.g[this.a[b]]);return a};l.ja=function(){ob(this);return this.a.concat()};l.clear=function(){this.g={};this.j=this.h=
    this.a.length=0;};function ob(a){if(a.h!=a.a.length){for(var b=0,c=0;b<a.a.length;){var d=a.a[b];pb(a.g,d)&&(a.a[c++]=d);b++;}a.a.length=c;}if(a.h!=a.a.length){var e={};for(c=b=0;b<a.a.length;)d=a.a[b],pb(e,d)||(a.a[c++]=d,e[d]=1),b++;a.a.length=c;}}l.get=function(a,b){return pb(this.g,a)?this.g[a]:b};l.set=function(a,b){pb(this.g,a)||(this.h++,this.a.push(a),this.j++);this.g[a]=b;};l.forEach=function(a,b){for(var c=this.ja(),d=0;d<c.length;d++){var e=c[d],f=this.get(e);a.call(b,f,e,this);}};l.ha=function(a){ob(this);
    var b=0,c=this.j,d=this,e=new jb;e.next=function(){if(c!=d.j)throw Error("The map has changed since the iterator was created");if(b>=d.a.length)throw ib;var f=d.a[b++];return a?f:d.g[f]};return e};function pb(a,b){return Object.prototype.hasOwnProperty.call(a,b)}var qb=/^(?:([^:/?#.]+):)?(?:\/\/(?:([^/?#]*)@)?([^/#?]*?)(?::([0-9]+))?(?=[/#?]|$))?([^?#]+)?(?:\?([^#]*))?(?:#([\s\S]*))?$/;function rb(a,b){if(a){a=a.split("&");for(var c=0;c<a.length;c++){var d=a[c].indexOf("="),e=null;if(0<=d){var f=
    a[c].substring(0,d);e=a[c].substring(d+1);}else f=a[c];b(f,e?decodeURIComponent(e.replace(/\+/g," ")):"");}}}function sb(a,b,c,d){for(var e=c.length;0<=(b=a.indexOf(c,b))&&b<d;){var f=a.charCodeAt(b-1);if(38==f||63==f)if(f=a.charCodeAt(b+e),!f||61==f||38==f||35==f)return b;b+=e+1;}return -1}var tb=/#|$/;function ub(a,b){var c=a.search(tb),d=sb(a,0,b,c);if(0>d)return null;var e=a.indexOf("&",d);if(0>e||e>c)e=c;d+=b.length+1;return decodeURIComponent(a.substr(d,e-d).replace(/\+/g," "))}var vb=/[?&]($|#)/;
    function wb(a,b){this.h=this.A=this.j="";this.C=null;this.s=this.g="";this.i=!1;var c;a instanceof wb?(this.i=ka(b)?b:a.i,xb(this,a.j),this.A=a.A,this.h=a.h,yb(this,a.C),this.g=a.g,zb(this,Ab(a.a)),this.s=a.s):a&&(c=String(a).match(qb))?(this.i=!!b,xb(this,c[1]||"",!0),this.A=Bb(c[2]||""),this.h=Bb(c[3]||"",!0),yb(this,c[4]),this.g=Bb(c[5]||"",!0),zb(this,c[6]||"",!0),this.s=Bb(c[7]||"")):(this.i=!!b,this.a=new Cb(null,this.i));}wb.prototype.toString=function(){var a=[],b=this.j;b&&a.push(Db(b,Eb,
    !0),":");var c=this.h;if(c||"file"==b)a.push("//"),(b=this.A)&&a.push(Db(b,Eb,!0),"@"),a.push(encodeURIComponent(String(c)).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),c=this.C,null!=c&&a.push(":",String(c));if(c=this.g)this.h&&"/"!=c.charAt(0)&&a.push("/"),a.push(Db(c,"/"==c.charAt(0)?Fb:Gb,!0));(c=this.a.toString())&&a.push("?",c);(c=this.s)&&a.push("#",Db(c,Hb));return a.join("")};function xb(a,b,c){a.j=c?Bb(b,!0):b;a.j&&(a.j=a.j.replace(/:$/,""));}function yb(a,b){if(b){b=Number(b);if(isNaN(b)||0>b)throw Error("Bad port number "+
    b);a.C=b;}else a.C=null;}function zb(a,b,c){b instanceof Cb?(a.a=b,Ib(a.a,a.i)):(c||(b=Db(b,Jb)),a.a=new Cb(b,a.i));}function Kb(a){return a instanceof wb?new wb(a):new wb(a,void 0)}function Bb(a,b){return a?b?decodeURI(a.replace(/%25/g,"%2525")):decodeURIComponent(a):""}function Db(a,b,c){return q(a)?(a=encodeURI(a).replace(b,Lb),c&&(a=a.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),a):null}function Lb(a){a=a.charCodeAt(0);return "%"+(a>>4&15).toString(16)+(a&15).toString(16)}var Eb=/[#\/\?@]/g,Gb=/[#\?:]/g,
    Fb=/[#\?]/g,Jb=/[#\?@]/g,Hb=/#/g;function Cb(a,b){this.g=this.a=null;this.h=a||null;this.j=!!b;}function Mb(a){a.a||(a.a=new nb,a.g=0,a.h&&rb(a.h,function(b,c){a.add(decodeURIComponent(b.replace(/\+/g," ")),c);}));}l=Cb.prototype;l.add=function(a,b){Mb(this);this.h=null;a=Nb(this,a);var c=this.a.get(a);c||this.a.set(a,c=[]);c.push(b);this.g+=1;return this};function Ob(a,b){Mb(a);b=Nb(a,b);pb(a.a.g,b)&&(a.h=null,a.g-=a.a.get(b).length,a=a.a,pb(a.g,b)&&(delete a.g[b],a.h--,a.j++,a.a.length>2*a.h&&ob(a)));}
    l.clear=function(){this.a=this.h=null;this.g=0;};function Pb(a,b){Mb(a);b=Nb(a,b);return pb(a.a.g,b)}l.forEach=function(a,b){Mb(this);this.a.forEach(function(c,d){Ha(c,function(e){a.call(b,e,d,this);},this);},this);};l.ja=function(){Mb(this);for(var a=this.a.la(),b=this.a.ja(),c=[],d=0;d<b.length;d++)for(var e=a[d],f=0;f<e.length;f++)c.push(b[d]);return c};l.la=function(a){Mb(this);var b=[];if(q(a))Pb(this,a)&&(b=Ra(b,this.a.get(Nb(this,a))));else {a=this.a.la();for(var c=0;c<a.length;c++)b=Ra(b,a[c]);}return b};
    l.set=function(a,b){Mb(this);this.h=null;a=Nb(this,a);Pb(this,a)&&(this.g-=this.a.get(a).length);this.a.set(a,[b]);this.g+=1;return this};l.get=function(a,b){if(!a)return b;a=this.la(a);return 0<a.length?String(a[0]):b};l.toString=function(){if(this.h)return this.h;if(!this.a)return "";for(var a=[],b=this.a.ja(),c=0;c<b.length;c++){var d=b[c],e=encodeURIComponent(String(d));d=this.la(d);for(var f=0;f<d.length;f++){var g=e;""!==d[f]&&(g+="="+encodeURIComponent(String(d[f])));a.push(g);}}return this.h=
    a.join("&")};function Ab(a){var b=new Cb;b.h=a.h;a.a&&(b.a=new nb(a.a),b.g=a.g);return b}function Nb(a,b){b=String(b);a.j&&(b=b.toLowerCase());return b}function Ib(a,b){b&&!a.j&&(Mb(a),a.h=null,a.a.forEach(function(c,d){var e=d.toLowerCase();d!=e&&(Ob(this,d),Ob(this,e),0<c.length&&(this.h=null,this.a.set(Nb(this,e),Sa(c)),this.g+=c.length));},a));a.j=b;}function Qb(a){this.a=Kb(a);}function Rb(a,b){b?a.a.a.set(x.Sa,b):Ob(a.a.a,x.Sa);}function Sb(a,b){null!==b?a.a.a.set(x.Qa,b?"1":"0"):Ob(a.a.a,x.Qa);}
    function Tb(a){return a.a.a.get(x.Pa)||null}function Ub(a,b){b?a.a.a.set(x.PROVIDER_ID,b):Ob(a.a.a,x.PROVIDER_ID);}Qb.prototype.toString=function(){return this.a.toString()};var x={Pa:"ui_auid",jc:"apiKey",Qa:"ui_sd",ub:"mode",$a:"oobCode",PROVIDER_ID:"ui_pid",Sa:"ui_sid",vb:"tenantId"};var Vb;a:{var Wb=n.navigator;if(Wb){var Xb=Wb.userAgent;if(Xb){Vb=Xb;break a}}Vb="";}function y(a){return -1!=Vb.indexOf(a)}function Yb(){return (y("Chrome")||y("CriOS"))&&!y("Edge")}function Zb(a){Zb[" "](a);return a}
    Zb[" "]=na;function $b(a,b){var c=ac;return Object.prototype.hasOwnProperty.call(c,a)?c[a]:c[a]=b(a)}var bc=y("Opera"),z=y("Trident")||y("MSIE"),cc=y("Edge"),dc=cc||z,ec=y("Gecko")&&!(-1!=Vb.toLowerCase().indexOf("webkit")&&!y("Edge"))&&!(y("Trident")||y("MSIE"))&&!y("Edge"),fc=-1!=Vb.toLowerCase().indexOf("webkit")&&!y("Edge"),gc=fc&&y("Mobile"),hc=y("Macintosh");function ic(){var a=n.document;return a?a.documentMode:void 0}var jc;a:{var kc="",lc=function(){var a=Vb;if(ec)return /rv:([^\);]+)(\)|;)/.exec(a);
    if(cc)return /Edge\/([\d\.]+)/.exec(a);if(z)return /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/.exec(a);if(fc)return /WebKit\/(\S+)/.exec(a);if(bc)return /(?:Version)[ \/]?(\S+)/.exec(a)}();lc&&(kc=lc?lc[1]:"");if(z){var mc=ic();if(null!=mc&&mc>parseFloat(kc)){jc=String(mc);break a}}jc=kc;}var ac={};function nc(a){return $b(a,function(){for(var b=0,c=Va(String(jc)).split("."),d=Va(String(a)).split("."),e=Math.max(c.length,d.length),f=0;0==b&&f<e;f++){var g=c[f]||"",h=d[f]||"";do{g=/(\d*)(\D*)(.*)/.exec(g)||["",
    "","",""];h=/(\d*)(\D*)(.*)/.exec(h)||["","","",""];if(0==g[0].length&&0==h[0].length)break;b=cb(0==g[1].length?0:parseInt(g[1],10),0==h[1].length?0:parseInt(h[1],10))||cb(0==g[2].length,0==h[2].length)||cb(g[2],h[2]);g=g[3];h=h[3];}while(0==b)}return 0<=b})}var oc;var pc=n.document;oc=pc&&z?ic()||("CSS1Compat"==pc.compatMode?parseInt(jc,10):5):void 0;function qc(a,b){this.a=a===rc&&b||"";this.g=sc;}qc.prototype.ma=!0;qc.prototype.ka=function(){return this.a};qc.prototype.toString=function(){return "Const{"+
    this.a+"}"};var sc={},rc={};function tc(){this.a="";this.h=uc;}tc.prototype.ma=!0;tc.prototype.ka=function(){return this.a.toString()};tc.prototype.g=function(){return 1};tc.prototype.toString=function(){return "TrustedResourceUrl{"+this.a+"}"};function vc(a){if(a instanceof tc&&a.constructor===tc&&a.h===uc)return a.a;Fa("expected object of type TrustedResourceUrl, got '"+a+"' of type "+pa(a));return "type_error:TrustedResourceUrl"}function wc(){var a=xc;a instanceof qc&&a.constructor===qc&&a.g===sc?
    a=a.a:(Fa("expected object of type Const, got '"+a+"'"),a="type_error:Const");var b=new tc;b.a=a;return b}var uc={};function yc(){this.a="";this.h=zc;}yc.prototype.ma=!0;yc.prototype.ka=function(){return this.a.toString()};yc.prototype.g=function(){return 1};yc.prototype.toString=function(){return "SafeUrl{"+this.a+"}"};function Ac(a){if(a instanceof yc&&a.constructor===yc&&a.h===zc)return a.a;Fa("expected object of type SafeUrl, got '"+a+"' of type "+pa(a));return "type_error:SafeUrl"}var Bc=/^(?:(?:https?|mailto|ftp):|[^:/?#]*(?:[/?#]|$))/i;
    function Cc(a){if(a instanceof yc)return a;a="object"==typeof a&&a.ma?a.ka():String(a);Bc.test(a)||(a="about:invalid#zClosurez");return Dc(a)}function Ec(a){if(a instanceof yc)return a;a="object"==typeof a&&a.ma?a.ka():String(a);Bc.test(a)||(a="about:invalid#zClosurez");return Dc(a)}var zc={};function Dc(a){var b=new yc;b.a=a;return b}Dc("about:blank");function Fc(){this.a="";this.g=Gc;}Fc.prototype.ma=!0;var Gc={};Fc.prototype.ka=function(){return this.a};Fc.prototype.toString=function(){return "SafeStyle{"+
    this.a+"}"};function Hc(){this.a="";this.j=Ic;this.h=null;}Hc.prototype.g=function(){return this.h};Hc.prototype.ma=!0;Hc.prototype.ka=function(){return this.a.toString()};Hc.prototype.toString=function(){return "SafeHtml{"+this.a+"}"};function Jc(a){if(a instanceof Hc&&a.constructor===Hc&&a.j===Ic)return a.a;Fa("expected object of type SafeHtml, got '"+a+"' of type "+pa(a));return "type_error:SafeHtml"}var Ic={};function Kc(a,b){var c=new Hc;c.a=a;c.h=b;return c}Kc("<!DOCTYPE html>",0);var Lc=Kc("",
    0);Kc("<br>",0);var Mc=function(a){var b=!1,c;return function(){b||(c=a(),b=!0);return c}}(function(){if("undefined"===typeof document)return !1;var a=document.createElement("div"),b=document.createElement("div");b.appendChild(document.createElement("div"));a.appendChild(b);if(!a.firstChild)return !1;b=a.firstChild.firstChild;a.innerHTML=Jc(Lc);return !b.parentElement});function Nc(a,b){a.src=vc(b);if(null===ma)b:{b=n.document;if((b=b.querySelector&&b.querySelector("script[nonce]"))&&(b=b.nonce||b.getAttribute("nonce"))&&
    la.test(b)){ma=b;break b}ma="";}b=ma;b&&a.setAttribute("nonce",b);}function Oc(a,b){b=b instanceof yc?b:Ec(b);a.assign(Ac(b));}function Pc(a,b){this.a=ka(a)?a:0;this.g=ka(b)?b:0;}Pc.prototype.toString=function(){return "("+this.a+", "+this.g+")"};Pc.prototype.ceil=function(){this.a=Math.ceil(this.a);this.g=Math.ceil(this.g);return this};Pc.prototype.floor=function(){this.a=Math.floor(this.a);this.g=Math.floor(this.g);return this};Pc.prototype.round=function(){this.a=Math.round(this.a);this.g=Math.round(this.g);
    return this};function Qc(a,b){this.width=a;this.height=b;}l=Qc.prototype;l.toString=function(){return "("+this.width+" x "+this.height+")"};l.aspectRatio=function(){return this.width/this.height};l.ceil=function(){this.width=Math.ceil(this.width);this.height=Math.ceil(this.height);return this};l.floor=function(){this.width=Math.floor(this.width);this.height=Math.floor(this.height);return this};l.round=function(){this.width=Math.round(this.width);this.height=Math.round(this.height);return this};function Rc(a){return a?
    new Sc(Tc(a)):Da||(Da=new Sc)}function Uc(a,b){var c=b||document;return c.querySelectorAll&&c.querySelector?c.querySelectorAll("."+a):Vc(document,a,b)}function Wc(a,b){var c=b||document;if(c.getElementsByClassName)a=c.getElementsByClassName(a)[0];else {c=document;var d=b||c;a=d.querySelectorAll&&d.querySelector&&a?d.querySelector(a?"."+a:""):Vc(c,a,b)[0]||null;}return a||null}function Vc(a,b,c){var d;a=c||a;if(a.querySelectorAll&&a.querySelector&&b)return a.querySelectorAll(b?"."+b:"");if(b&&a.getElementsByClassName){var e=
    a.getElementsByClassName(b);return e}e=a.getElementsByTagName("*");if(b){var f={};for(c=d=0;a=e[c];c++){var g=a.className;"function"==typeof g.split&&Ma(g.split(/\s+/),b)&&(f[d++]=a);}f.length=d;return f}return e}function Xc(a,b){eb(b,function(c,d){c&&"object"==typeof c&&c.ma&&(c=c.ka());"style"==d?a.style.cssText=c:"class"==d?a.className=c:"for"==d?a.htmlFor=c:Yc.hasOwnProperty(d)?a.setAttribute(Yc[d],c):0==d.lastIndexOf("aria-",0)||0==d.lastIndexOf("data-",0)?a.setAttribute(d,c):a[d]=c;});}var Yc=
    {cellpadding:"cellPadding",cellspacing:"cellSpacing",colspan:"colSpan",frameborder:"frameBorder",height:"height",maxlength:"maxLength",nonce:"nonce",role:"role",rowspan:"rowSpan",type:"type",usemap:"useMap",valign:"vAlign",width:"width"};function Zc(a){return a.scrollingElement?a.scrollingElement:fc||"CSS1Compat"!=a.compatMode?a.body||a.documentElement:a.documentElement}function $c(a){a&&a.parentNode&&a.parentNode.removeChild(a);}function Tc(a){return 9==a.nodeType?a:a.ownerDocument||a.document}function ad(a,
    b){if("textContent"in a)a.textContent=b;else if(3==a.nodeType)a.data=String(b);else if(a.firstChild&&3==a.firstChild.nodeType){for(;a.lastChild!=a.firstChild;)a.removeChild(a.lastChild);a.firstChild.data=String(b);}else {for(var c;c=a.firstChild;)a.removeChild(c);a.appendChild(Tc(a).createTextNode(String(b)));}}function bd(a,b){return b?cd(a,function(c){return !b||q(c.className)&&Ma(c.className.split(/\s+/),b)}):null}function cd(a,b){for(;a;){if(b(a))return a;a=a.parentNode;}return null}function Sc(a){this.a=
    a||n.document||document;}Sc.prototype.N=function(){return q(void 0)?this.a.getElementById(void 0):void 0};var dd={Dc:!0},ed={Fc:!0},fd={Cc:!0},gd={Ec:!0};function hd(){throw Error("Do not instantiate directly");}hd.prototype.va=null;hd.prototype.toString=function(){return this.content};function id(a,b,c,d){a=a(b||ld,void 0,c);d=(d||Rc()).a.createElement("DIV");a=md(a);a.match(nd);a=Kc(a,null);if(Mc())for(;d.lastChild;)d.removeChild(d.lastChild);d.innerHTML=Jc(a);1==d.childNodes.length&&(a=d.firstChild,
    1==a.nodeType&&(d=a));return d}function md(a){if(!ta(a))return db(String(a));if(a instanceof hd){if(a.fa===dd)return a.content;if(a.fa===gd)return db(a.content)}Fa("Soy template output is unsafe for use as HTML: "+a);return "zSoyz"}var nd=/^<(body|caption|col|colgroup|head|html|tr|td|th|tbody|thead|tfoot)>/i,ld={};function od(a){if(null!=a)switch(a.va){case 1:return 1;case -1:return -1;case 0:return 0}return null}function pd(){hd.call(this);}w(pd,hd);pd.prototype.fa=dd;function A(a){return null!=a&&
    a.fa===dd?a:a instanceof Hc?B(Jc(a).toString(),a.g()):B(db(String(String(a))),od(a))}function qd(){hd.call(this);}w(qd,hd);qd.prototype.fa=ed;qd.prototype.va=1;function rd(a,b){this.content=String(a);this.va=null!=b?b:null;}w(rd,hd);rd.prototype.fa=gd;function C(a){return new rd(a,void 0)}var B=function(a){function b(c){this.content=c;}b.prototype=a.prototype;return function(c,d){c=new b(String(c));void 0!==d&&(c.va=d);return c}}(pd),sd=function(a){function b(c){this.content=c;}b.prototype=a.prototype;
    return function(c){return new b(String(c))}}(qd);function td(a){function b(){}var c={label:D("New password")};b.prototype=a;a=new b;for(var d in c)a[d]=c[d];return a}function D(a){return (a=String(a))?new rd(a,void 0):""}var ud=function(a){function b(c){this.content=c;}b.prototype=a.prototype;return function(c,d){c=String(c);if(!c)return "";c=new b(c);void 0!==d&&(c.va=d);return c}}(pd);function vd(a){return null!=a&&a.fa===dd?String(String(a.content).replace(wd,"").replace(xd,"&lt;")).replace(yd,zd):
    db(String(a))}function Ad(a){null!=a&&a.fa===ed?a=String(a).replace(Bd,Cd):a instanceof yc?a=String(Ac(a).toString()).replace(Bd,Cd):(a=String(a),Dd.test(a)?a=a.replace(Bd,Cd):(Fa("Bad value `%s` for |filterNormalizeUri",[a]),a="#zSoyz"));return a}function Ed(a){null!=a&&a.fa===fd?a=a.content:null==a?a="":a instanceof Fc?a instanceof Fc&&a.constructor===Fc&&a.g===Gc?a=a.a:(Fa("expected object of type SafeStyle, got '"+a+"' of type "+pa(a)),a="type_error:SafeStyle"):(a=String(a),Fd.test(a)||(Fa("Bad value `%s` for |filterCssValue",
    [a]),a="zSoyz"));return a}var Gd={"\x00":"&#0;","\t":"&#9;","\n":"&#10;","\x0B":"&#11;","\f":"&#12;","\r":"&#13;"," ":"&#32;",'"':"&quot;","&":"&amp;","'":"&#39;","-":"&#45;","/":"&#47;","<":"&lt;","=":"&#61;",">":"&gt;","`":"&#96;","\u0085":"&#133;","\u00a0":"&#160;","\u2028":"&#8232;","\u2029":"&#8233;"};function zd(a){return Gd[a]}var Hd={"\x00":"%00","\u0001":"%01","\u0002":"%02","\u0003":"%03","\u0004":"%04","\u0005":"%05","\u0006":"%06","\u0007":"%07","\b":"%08","\t":"%09","\n":"%0A","\x0B":"%0B",
    "\f":"%0C","\r":"%0D","\u000e":"%0E","\u000f":"%0F","\u0010":"%10","\u0011":"%11","\u0012":"%12","\u0013":"%13","\u0014":"%14","\u0015":"%15","\u0016":"%16","\u0017":"%17","\u0018":"%18","\u0019":"%19","\u001a":"%1A","\u001b":"%1B","\u001c":"%1C","\u001d":"%1D","\u001e":"%1E","\u001f":"%1F"," ":"%20",'"':"%22","'":"%27","(":"%28",")":"%29","<":"%3C",">":"%3E","\\":"%5C","{":"%7B","}":"%7D","\u007f":"%7F","\u0085":"%C2%85","\u00a0":"%C2%A0","\u2028":"%E2%80%A8","\u2029":"%E2%80%A9","\uff01":"%EF%BC%81",
    "\uff03":"%EF%BC%83","\uff04":"%EF%BC%84","\uff06":"%EF%BC%86","\uff07":"%EF%BC%87","\uff08":"%EF%BC%88","\uff09":"%EF%BC%89","\uff0a":"%EF%BC%8A","\uff0b":"%EF%BC%8B","\uff0c":"%EF%BC%8C","\uff0f":"%EF%BC%8F","\uff1a":"%EF%BC%9A","\uff1b":"%EF%BC%9B","\uff1d":"%EF%BC%9D","\uff1f":"%EF%BC%9F","\uff20":"%EF%BC%A0","\uff3b":"%EF%BC%BB","\uff3d":"%EF%BC%BD"};function Cd(a){return Hd[a]}var yd=/[\x00\x22\x27\x3c\x3e]/g,Bd=/[\x00- \x22\x27-\x29\x3c\x3e\\\x7b\x7d\x7f\x85\xa0\u2028\u2029\uff01\uff03\uff04\uff06-\uff0c\uff0f\uff1a\uff1b\uff1d\uff1f\uff20\uff3b\uff3d]/g,
    Fd=/^(?!-*(?:expression|(?:moz-)?binding))(?:[.#]?-?(?:[_a-z0-9-]+)(?:-[_a-z0-9-]+)*-?|-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[a-z]{1,2}|%)?|!important|)$/i,Dd=/^(?![^#?]*\/(?:\.|%2E){2}(?:[\/?#]|$))(?:(?:https?|mailto):|[^&:\/?#]*(?:[\/?#]|$))/i,wd=/<(?:!|\/?([a-zA-Z][a-zA-Z0-9:\-]*))(?:[^>'"]|"[^"]*"|'[^']*')*>/g,xd=/</g;function Id(){return C("Enter a valid phone number")}function Jd(){return C("Unable to send password reset code to specified email")}function Kd(){return C("Something went wrong. Please try again.")}
    function Ld(){return C("This email already exists without any means of sign-in. Please reset the password to recover.")}function Md(a){a=a||{};var b="";switch(a.code){case "invalid-argument":b+="Client specified an invalid argument.";break;case "invalid-configuration":b+="Client specified an invalid project configuration.";break;case "failed-precondition":b+="Request can not be executed in the current system state.";break;case "out-of-range":b+="Client specified an invalid range.";break;case "unauthenticated":b+=
    "Request not authenticated due to missing, invalid, or expired OAuth token.";break;case "permission-denied":b+="Client does not have sufficient permission.";break;case "not-found":b+="Specified resource is not found.";break;case "aborted":b+="Concurrency conflict, such as read-modify-write conflict.";break;case "already-exists":b+="The resource that a client tried to create already exists.";break;case "resource-exhausted":b+="Either out of resource quota or reaching rate limiting.";break;case "cancelled":b+=
    "Request cancelled by the client.";break;case "data-loss":b+="Unrecoverable data loss or data corruption.";break;case "unknown":b+="Unknown server error.";break;case "internal":b+="Internal server error.";break;case "not-implemented":b+="API method not implemented by the server.";break;case "unavailable":b+="Service unavailable.";break;case "deadline-exceeded":b+="Request deadline exceeded.";break;case "auth/user-disabled":b+="The user account has been disabled by an administrator.";break;case "auth/timeout":b+=
    "The operation has timed out.";break;case "auth/too-many-requests":b+="We have blocked all requests from this device due to unusual activity. Try again later.";break;case "auth/quota-exceeded":b+="The quota for this operation has been exceeded. Try again later.";break;case "auth/network-request-failed":b+="A network error has occurred. Try again later.";break;case "restart-process":b+="An issue was encountered when authenticating your request. Please visit the URL that redirected you to this page again to restart the authentication process.";
    break;case "no-matching-tenant-for-email":b+="No sign-in provider is available for the given email, please try with a different email.";}return C(b)}function Nd(){return C("Please login again to perform this operation")}function Od(a,b,c){var d=Error.call(this);this.message=d.message;"stack"in d&&(this.stack=d.stack);this.code=Pd+a;if(!(a=b)){a="";switch(this.code){case "firebaseui/merge-conflict":a+="The current anonymous user failed to upgrade. The non-anonymous credential is already associated with a different user account.";
    break;default:a+=Kd();}a=C(a).toString();}this.message=a||"";this.credential=c||null;}m(Od,Error);Od.prototype.toJSON=function(){return {code:this.code,message:this.message}};var Pd="firebaseui/";function Qd(){this.T=this.T;this.C=this.C;}var Rd=0;Qd.prototype.T=!1;Qd.prototype.o=function(){if(!this.T&&(this.T=!0,this.m(),0!=Rd)){var a=this[ua]||(this[ua]=++va);}};function Td(a,b){a.T?ka(void 0)?b.call(void 0):b():(a.C||(a.C=[]),a.C.push(ka(void 0)?t(b,void 0):b));}Qd.prototype.m=function(){if(this.C)for(;this.C.length;)this.C.shift()();};function Ud(a){a&&"function"==typeof a.o&&a.o();}var Vd=Object.freeze||function(a){return a};var Wd=!z||9<=Number(oc),Xd=z&&!nc("9"),Yd=function(){if(!n.addEventListener||!Object.defineProperty)return !1;var a=!1,b=Object.defineProperty({},"passive",{get:function(){a=!0;}});try{n.addEventListener("test",na,b),n.removeEventListener("test",
    na,b);}catch(c){}return a}();function Zd(a,b){this.type=a;this.g=this.target=b;this.h=!1;this.qb=!0;}Zd.prototype.stopPropagation=function(){this.h=!0;};Zd.prototype.preventDefault=function(){this.qb=!1;};function $d(a,b){Zd.call(this,a?a.type:"");this.relatedTarget=this.g=this.target=null;this.button=this.screenY=this.screenX=this.clientY=this.clientX=0;this.key="";this.j=this.keyCode=0;this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1;this.pointerId=0;this.pointerType="";this.a=null;if(a){var c=
    this.type=a.type,d=a.changedTouches&&a.changedTouches.length?a.changedTouches[0]:null;this.target=a.target||a.srcElement;this.g=b;if(b=a.relatedTarget){if(ec){a:{try{Zb(b.nodeName);var e=!0;break a}catch(f){}e=!1;}e||(b=null);}}else "mouseover"==c?b=a.fromElement:"mouseout"==c&&(b=a.toElement);this.relatedTarget=b;d?(this.clientX=void 0!==d.clientX?d.clientX:d.pageX,this.clientY=void 0!==d.clientY?d.clientY:d.pageY,this.screenX=d.screenX||0,this.screenY=d.screenY||0):(this.clientX=void 0!==a.clientX?
    a.clientX:a.pageX,this.clientY=void 0!==a.clientY?a.clientY:a.pageY,this.screenX=a.screenX||0,this.screenY=a.screenY||0);this.button=a.button;this.keyCode=a.keyCode||0;this.key=a.key||"";this.j=a.charCode||("keypress"==c?a.keyCode:0);this.ctrlKey=a.ctrlKey;this.altKey=a.altKey;this.shiftKey=a.shiftKey;this.metaKey=a.metaKey;this.pointerId=a.pointerId||0;this.pointerType=q(a.pointerType)?a.pointerType:ae[a.pointerType]||"";this.a=a;a.defaultPrevented&&this.preventDefault();}}w($d,Zd);var ae=Vd({2:"touch",
    3:"pen",4:"mouse"});$d.prototype.stopPropagation=function(){$d.K.stopPropagation.call(this);this.a.stopPropagation?this.a.stopPropagation():this.a.cancelBubble=!0;};$d.prototype.preventDefault=function(){$d.K.preventDefault.call(this);var a=this.a;if(a.preventDefault)a.preventDefault();else if(a.returnValue=!1,Xd)try{if(a.ctrlKey||112<=a.keyCode&&123>=a.keyCode)a.keyCode=-1;}catch(b){}};var be="closure_listenable_"+(1E6*Math.random()|0),ce=0;function de(a,b,c,d,e){this.listener=a;this.proxy=null;this.src=
    b;this.type=c;this.capture=!!d;this.La=e;this.key=++ce;this.sa=this.Ia=!1;}function ee(a){a.sa=!0;a.listener=null;a.proxy=null;a.src=null;a.La=null;}function fe(a){this.src=a;this.a={};this.g=0;}fe.prototype.add=function(a,b,c,d,e){var f=a.toString();a=this.a[f];a||(a=this.a[f]=[],this.g++);var g=ge(a,b,d,e);-1<g?(b=a[g],c||(b.Ia=!1)):(b=new de(b,this.src,f,!!d,e),b.Ia=c,a.push(b));return b};function he(a,b){var c=b.type;c in a.a&&Na(a.a[c],b)&&(ee(b),0==a.a[c].length&&(delete a.a[c],a.g--));}function ge(a,
    b,c,d){for(var e=0;e<a.length;++e){var f=a[e];if(!f.sa&&f.listener==b&&f.capture==!!c&&f.La==d)return e}return -1}var ie="closure_lm_"+(1E6*Math.random()|0),je={};function le(a,b,c,d,e){if(d&&d.once)return me(a,b,c,d,e);if(qa(b)){for(var f=0;f<b.length;f++)le(a,b[f],c,d,e);return null}c=ne(c);return a&&a[be]?a.J.add(String(b),c,!1,ta(d)?!!d.capture:!!d,e):oe(a,b,c,!1,d,e)}function oe(a,b,c,d,e,f){if(!b)throw Error("Invalid event type");var g=ta(e)?!!e.capture:!!e,h=pe(a);h||(a[ie]=h=new fe(a));
    c=h.add(b,c,d,g,f);if(c.proxy)return c;d=qe();c.proxy=d;d.src=a;d.listener=c;if(a.addEventListener)Yd||(e=g),void 0===e&&(e=!1),a.addEventListener(b.toString(),d,e);else if(a.attachEvent)a.attachEvent(re(b.toString()),d);else if(a.addListener&&a.removeListener)a.addListener(d);else throw Error("addEventListener and attachEvent are unavailable.");return c}function qe(){var a=se,b=Wd?function(c){return a.call(b.src,b.listener,c)}:function(c){c=a.call(b.src,b.listener,c);if(!c)return c};return b}
    function me(a,b,c,d,e){if(qa(b)){for(var f=0;f<b.length;f++)me(a,b[f],c,d,e);return null}c=ne(c);return a&&a[be]?a.J.add(String(b),c,!0,ta(d)?!!d.capture:!!d,e):oe(a,b,c,!0,d,e)}function te(a,b,c,d,e){if(qa(b))for(var f=0;f<b.length;f++)te(a,b[f],c,d,e);else (d=ta(d)?!!d.capture:!!d,c=ne(c),a&&a[be])?(a=a.J,b=String(b).toString(),b in a.a&&(f=a.a[b],c=ge(f,c,d,e),-1<c&&(ee(f[c]),Oa(f,c),0==f.length&&(delete a.a[b],a.g--)))):a&&(a=pe(a))&&(b=a.a[b.toString()],a=-1,b&&(a=ge(b,c,d,e)),(c=-1<a?b[a]:null)&&
    ue(c));}function ue(a){if("number"!=typeof a&&a&&!a.sa){var b=a.src;if(b&&b[be])he(b.J,a);else {var c=a.type,d=a.proxy;b.removeEventListener?b.removeEventListener(c,d,a.capture):b.detachEvent?b.detachEvent(re(c),d):b.addListener&&b.removeListener&&b.removeListener(d);(c=pe(b))?(he(c,a),0==c.g&&(c.src=null,b[ie]=null)):ee(a);}}}function re(a){return a in je?je[a]:je[a]="on"+a}function ve(a,b,c,d){var e=!0;if(a=pe(a))if(b=a.a[b.toString()])for(b=b.concat(),a=0;a<b.length;a++){var f=b[a];f&&f.capture==
    c&&!f.sa&&(f=we(f,d),e=e&&!1!==f);}return e}function we(a,b){var c=a.listener,d=a.La||a.src;a.Ia&&ue(a);return c.call(d,b)}function se(a,b){if(a.sa)return !0;if(!Wd){if(!b)a:{b=["window","event"];for(var c=n,d=0;d<b.length;d++)if(c=c[b[d]],null==c){b=null;break a}b=c;}d=b;b=new $d(d,this);c=!0;if(!(0>d.keyCode||void 0!=d.returnValue)){a:{var e=!1;if(0==d.keyCode)try{d.keyCode=-1;break a}catch(g){e=!0;}if(e||void 0==d.returnValue)d.returnValue=!0;}d=[];for(e=b.g;e;e=e.parentNode)d.push(e);a=a.type;for(e=
    d.length-1;!b.h&&0<=e;e--){b.g=d[e];var f=ve(d[e],a,!0,b);c=c&&f;}for(e=0;!b.h&&e<d.length;e++)b.g=d[e],f=ve(d[e],a,!1,b),c=c&&f;}return c}return we(a,new $d(b,this))}function pe(a){a=a[ie];return a instanceof fe?a:null}var xe="__closure_events_fn_"+(1E9*Math.random()>>>0);function ne(a){if(sa(a))return a;a[xe]||(a[xe]=function(b){return a.handleEvent(b)});return a[xe]}function E(){Qd.call(this);this.J=new fe(this);this.wb=this;this.Ha=null;}w(E,Qd);E.prototype[be]=!0;E.prototype.Za=function(a){this.Ha=
    a;};E.prototype.removeEventListener=function(a,b,c,d){te(this,a,b,c,d);};function ye(a,b){var c,d=a.Ha;if(d)for(c=[];d;d=d.Ha)c.push(d);a=a.wb;d=b.type||b;if(q(b))b=new Zd(b,a);else if(b instanceof Zd)b.target=b.target||a;else {var e=b;b=new Zd(d,a);hb(b,e);}e=!0;if(c)for(var f=c.length-1;!b.h&&0<=f;f--){var g=b.g=c[f];e=ze(g,d,!0,b)&&e;}b.h||(g=b.g=a,e=ze(g,d,!0,b)&&e,b.h||(e=ze(g,d,!1,b)&&e));if(c)for(f=0;!b.h&&f<c.length;f++)g=b.g=c[f],e=ze(g,d,!1,b)&&e;return e}E.prototype.m=function(){E.K.m.call(this);
    if(this.J){var a=this.J,c;for(c in a.a){for(var d=a.a[c],e=0;e<d.length;e++)ee(d[e]);delete a.a[c];a.g--;}}this.Ha=null;};function ze(a,b,c,d){b=a.J.a[String(b)];if(!b)return !0;b=b.concat();for(var e=!0,f=0;f<b.length;++f){var g=b[f];if(g&&!g.sa&&g.capture==c){var h=g.listener,k=g.La||g.src;g.Ia&&he(a.J,g);e=!1!==h.call(k,d)&&e;}}return e&&0!=d.qb}var Ae={},Be=0;function Ce(a,b){if(!a)throw Error("Event target element must be provided!");a=De(a);if(Ae[a]&&Ae[a].length)for(var c=0;c<Ae[a].length;c++)ye(Ae[a][c],
    b);}function Ee(a){var b=De(a.N());Ae[b]&&Ae[b].length&&(Pa(Ae[b],function(c){return c==a}),Ae[b].length||delete Ae[b]);}function De(a){"undefined"===typeof a.a&&(a.a=Be,Be++);return a.a}function Fe(a){if(!a)throw Error("Event target element must be provided!");E.call(this);this.a=a;}m(Fe,E);Fe.prototype.N=function(){return this.a};Fe.prototype.register=function(){var a=De(this.N());Ae[a]?Ma(Ae[a],this)||Ae[a].push(this):Ae[a]=[this];};function Ge(a){if(!a)return !1;try{return !!a.$goog_Thenable}catch(b){return !1}}
    function He(a,b){this.h=a;this.j=b;this.g=0;this.a=null;}He.prototype.get=function(){if(0<this.g){this.g--;var a=this.a;this.a=a.next;a.next=null;}else a=this.h();return a};function Ie(a,b){a.j(b);100>a.g&&(a.g++,b.next=a.a,a.a=b);}function Je(){this.g=this.a=null;}var Le=new He(function(){return new Ke},function(a){a.reset();});Je.prototype.add=function(a,b){var c=Le.get();c.set(a,b);this.g?this.g.next=c:this.a=c;this.g=c;};function Me(){var a=Ne,b=null;a.a&&(b=a.a,a.a=a.a.next,a.a||(a.g=null),b.next=
    null);return b}function Ke(){this.next=this.g=this.a=null;}Ke.prototype.set=function(a,b){this.a=a;this.g=b;this.next=null;};Ke.prototype.reset=function(){this.next=this.g=this.a=null;};function Oe(a){n.setTimeout(function(){throw a;},0);}var Pe;function Qe(){var a=n.MessageChannel;"undefined"===typeof a&&"undefined"!==typeof window&&window.postMessage&&window.addEventListener&&!y("Presto")&&(a=function(){var e=document.createElement("IFRAME");e.style.display="none";e.src="";document.documentElement.appendChild(e);
    var f=e.contentWindow;e=f.document;e.open();e.write("");e.close();var g="callImmediate"+Math.random(),h="file:"==f.location.protocol?"*":f.location.protocol+"//"+f.location.host;e=t(function(k){if(("*"==h||k.origin==h)&&k.data==g)this.port1.onmessage();},this);f.addEventListener("message",e,!1);this.port1={};this.port2={postMessage:function(){f.postMessage(g,h);}};});if("undefined"!==typeof a&&!y("Trident")&&!y("MSIE")){var b=new a,c={},d=c;b.port1.onmessage=function(){if(ka(c.next)){c=c.next;var e=
    c.gb;c.gb=null;e();}};return function(e){d.next={gb:e};d=d.next;b.port2.postMessage(0);}}return "undefined"!==typeof document&&"onreadystatechange"in document.createElement("SCRIPT")?function(e){var f=document.createElement("SCRIPT");f.onreadystatechange=function(){f.onreadystatechange=null;f.parentNode.removeChild(f);f=null;e();e=null;};document.documentElement.appendChild(f);}:function(e){n.setTimeout(e,0);}}function Re(a,b){Se||Te();Ue||(Se(),Ue=!0);Ne.add(a,b);}var Se;function Te(){if(n.Promise&&n.Promise.resolve){var a=
    n.Promise.resolve(void 0);Se=function(){a.then(Ve);};}else Se=function(){var b=Ve;!sa(n.setImmediate)||n.Window&&n.Window.prototype&&!y("Edge")&&n.Window.prototype.setImmediate==n.setImmediate?(Pe||(Pe=Qe()),Pe(b)):n.setImmediate(b);};}var Ue=!1,Ne=new Je;function Ve(){for(var a;a=Me();){try{a.a.call(a.g);}catch(b){Oe(b);}Ie(Le,a);}Ue=!1;}function F(a){this.a=We;this.A=void 0;this.j=this.g=this.h=null;this.s=this.i=!1;if(a!=na)try{var b=this;a.call(void 0,function(c){Xe(b,Ye,c);},function(c){if(!(c instanceof
    Ze))try{if(c instanceof Error)throw c;throw Error("Promise rejected.");}catch(d){}Xe(b,$e,c);});}catch(c){Xe(this,$e,c);}}var We=0,Ye=2,$e=3;function af(){this.next=this.j=this.g=this.s=this.a=null;this.h=!1;}af.prototype.reset=function(){this.j=this.g=this.s=this.a=null;this.h=!1;};var bf=new He(function(){return new af},function(a){a.reset();});function cf(a,b,c){var d=bf.get();d.s=a;d.g=b;d.j=c;return d}function G(a){if(a instanceof F)return a;var b=new F(na);Xe(b,Ye,a);return b}function df(a){return new F(function(b,
    c){c(a);})}F.prototype.then=function(a,b,c){return ef(this,sa(a)?a:null,sa(b)?b:null,c)};F.prototype.$goog_Thenable=!0;l=F.prototype;l.dc=function(a,b){a=cf(a,a,b);a.h=!0;ff(this,a);return this};l.Ca=function(a,b){return ef(this,null,a,b)};l.cancel=function(a){this.a==We&&Re(function(){var b=new Ze(a);gf(this,b);},this);};function gf(a,b){if(a.a==We)if(a.h){var c=a.h;if(c.g){for(var d=0,e=null,f=null,g=c.g;g&&(g.h||(d++,g.a==a&&(e=g),!(e&&1<d)));g=g.next)e||(f=g);e&&(c.a==We&&1==d?gf(c,b):(f?(d=f,d.next==
    c.j&&(c.j=d),d.next=d.next.next):hf(c),jf(c,e,$e,b)));}a.h=null;}else Xe(a,$e,b);}function ff(a,b){a.g||a.a!=Ye&&a.a!=$e||kf(a);a.j?a.j.next=b:a.g=b;a.j=b;}function ef(a,b,c,d){var e=cf(null,null,null);e.a=new F(function(f,g){e.s=b?function(h){try{var k=b.call(d,h);f(k);}catch(p){g(p);}}:f;e.g=c?function(h){try{var k=c.call(d,h);!ka(k)&&h instanceof Ze?g(h):f(k);}catch(p){g(p);}}:g;});e.a.h=a;ff(a,e);return e.a}l.fc=function(a){this.a=We;Xe(this,Ye,a);};l.gc=function(a){this.a=We;Xe(this,$e,a);};function Xe(a,
    b,c){if(a.a==We){a===c&&(b=$e,c=new TypeError("Promise cannot resolve to itself"));a.a=1;a:{var d=c,e=a.fc,f=a.gc;if(d instanceof F){ff(d,cf(e||na,f||null,a));var g=!0;}else if(Ge(d))d.then(e,f,a),g=!0;else {if(ta(d))try{var h=d.then;if(sa(h)){lf(d,h,e,f,a);g=!0;break a}}catch(k){f.call(a,k);g=!0;break a}g=!1;}}g||(a.A=c,a.a=b,a.h=null,kf(a),b!=$e||c instanceof Ze||mf(a,c));}}function lf(a,b,c,d,e){function f(k){h||(h=!0,d.call(e,k));}function g(k){h||(h=!0,c.call(e,k));}var h=!1;try{b.call(a,g,f);}catch(k){f(k);}}
    function kf(a){a.i||(a.i=!0,Re(a.Fb,a));}function hf(a){var b=null;a.g&&(b=a.g,a.g=b.next,b.next=null);a.g||(a.j=null);return b}l.Fb=function(){for(var a;a=hf(this);)jf(this,a,this.a,this.A);this.i=!1;};function jf(a,b,c,d){if(c==$e&&b.g&&!b.h)for(;a&&a.s;a=a.h)a.s=!1;if(b.a)b.a.h=null,nf(b,c,d);else try{b.h?b.s.call(b.j):nf(b,c,d);}catch(e){of.call(null,e);}Ie(bf,b);}function nf(a,b,c){b==Ye?a.s.call(a.j,c):a.g&&a.g.call(a.j,c);}function mf(a,b){a.s=!0;Re(function(){a.s&&of.call(null,b);});}var of=Oe;function Ze(a){Ca.call(this,
    a);}w(Ze,Ca);Ze.prototype.name="cancel";function pf(a,b,c){b||(b={});c=c||window;var d=a instanceof yc?a:Cc("undefined"!=typeof a.href?a.href:String(a));a=b.target||a.target;var e=[];for(f in b)switch(f){case "width":case "height":case "top":case "left":e.push(f+"="+b[f]);break;case "target":case "noopener":case "noreferrer":break;default:e.push(f+"="+(b[f]?1:0));}var f=e.join(",");(y("iPhone")&&!y("iPod")&&!y("iPad")||y("iPad")||y("iPod"))&&c.navigator&&c.navigator.standalone&&a&&"_self"!=a?(f=c.document.createElement("A"),
    d=d instanceof yc?d:Ec(d),f.href=Ac(d),f.setAttribute("target",a),b.noreferrer&&f.setAttribute("rel","noreferrer"),b=document.createEvent("MouseEvent"),b.initMouseEvent("click",!0,!0,c,1),f.dispatchEvent(b),c={}):b.noreferrer?(c=c.open("",a,f),b=Ac(d).toString(),c&&(dc&&-1!=b.indexOf(";")&&(b="'"+b.replace(/'/g,"%27")+"'"),c.opener=null,b=Kc('<meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0; url='+db(b)+'">',null),c.document.write(Jc(b)),c.document.close())):(c=c.open(Ac(d).toString(),
    a,f))&&b.noopener&&(c.opener=null);return c}function qf(){try{return !(!window.opener||!window.opener.location||window.opener.location.hostname!==window.location.hostname||window.opener.location.protocol!==window.location.protocol)}catch(a$1){}return !1}function rf(a){pf(a,{target:window.cordova&&window.cordova.InAppBrowser?"_system":"_blank"},void 0);}function sf(a,b){a=ta(a)&&1==a.nodeType?a:document.querySelector(String(a));if(null==a)throw Error(b||"Cannot find element.");return a}function tf(){return window.location.href}
    function uf(){var a=null;return (new F(function(b){"complete"==n.document.readyState?b():(a=function(){b();},me(window,"load",a));})).Ca(function(b){te(window,"load",a);throw b;})}function vf(){for(var a=32,b=[];0<a;)b.push("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(62*Math.random()))),a--;return b.join("")}function wf(a,b,c){c=void 0===c?{}:c;return Object.keys(a).filter(function(d){return b.includes(d)}).reduce(function(d,e){d[e]=a[e];return d},c)}function xf(a){var b=
    yf;this.s=[];this.T=b;this.O=a||null;this.j=this.a=!1;this.h=void 0;this.J=this.l=this.A=!1;this.i=0;this.g=null;this.C=0;}xf.prototype.cancel=function(a){if(this.a)this.h instanceof xf&&this.h.cancel();else {if(this.g){var b=this.g;delete this.g;a?b.cancel(a):(b.C--,0>=b.C&&b.cancel());}this.T?this.T.call(this.O,this):this.J=!0;this.a||(a=new zf(this),Af(this),Bf(this,!1,a));}};xf.prototype.L=function(a,b){this.A=!1;Bf(this,a,b);};function Bf(a,b,c){a.a=!0;a.h=c;a.j=!b;Cf(a);}function Af(a){if(a.a){if(!a.J)throw new Df(a);
    a.J=!1;}}xf.prototype.callback=function(a){Af(this);Bf(this,!0,a);};function Ef(a,b,c){a.s.push([b,c,void 0]);a.a&&Cf(a);}xf.prototype.then=function(a,b,c){var d,e,f=new F(function(g,h){d=g;e=h;});Ef(this,d,function(g){g instanceof zf?f.cancel():e(g);});return f.then(a,b,c)};xf.prototype.$goog_Thenable=!0;function Ff(a){return La(a.s,function(b){return sa(b[1])})}function Cf(a){if(a.i&&a.a&&Ff(a)){var b=a.i,c=Gf[b];c&&(n.clearTimeout(c.a),delete Gf[b]);a.i=0;}a.g&&(a.g.C--,delete a.g);b=a.h;for(var d=c=
    !1;a.s.length&&!a.A;){var e=a.s.shift(),f=e[0],g=e[1];e=e[2];if(f=a.j?g:f)try{var h=f.call(e||a.O,b);ka(h)&&(a.j=a.j&&(h==b||h instanceof Error),a.h=b=h);if(Ge(b)||"function"===typeof n.Promise&&b instanceof n.Promise)d=!0,a.A=!0;}catch(k){b=k,a.j=!0,Ff(a)||(c=!0);}}a.h=b;d&&(h=t(a.L,a,!0),d=t(a.L,a,!1),b instanceof xf?(Ef(b,h,d),b.l=!0):b.then(h,d));c&&(b=new Hf(b),Gf[b.a]=b,a.i=b.a);}function Df(){Ca.call(this);}w(Df,Ca);Df.prototype.message="Deferred has already fired";Df.prototype.name="AlreadyCalledError";
    function zf(){Ca.call(this);}w(zf,Ca);zf.prototype.message="Deferred was canceled";zf.prototype.name="CanceledError";function Hf(a){this.a=n.setTimeout(t(this.h,this),0);this.g=a;}Hf.prototype.h=function(){delete Gf[this.a];throw this.g;};var Gf={};function If(a){var c=document,d=vc(a).toString(),e=document.createElement("SCRIPT"),f={rb:e,sb:void 0},g=new xf(f),h=null,k=5E3;(h=window.setTimeout(function(){Jf(e,!0);var p=new Kf(Lf,"Timeout reached for loading script "+
    d);Af(g);Bf(g,!1,p);},k),f.sb=h);e.onload=e.onreadystatechange=function(){e.readyState&&"loaded"!=e.readyState&&"complete"!=e.readyState||(Jf(e,!1,h),g.callback(null));};e.onerror=function(){Jf(e,!0,h);var p=new Kf(Mf,"Error while loading script "+d);Af(g);Bf(g,!1,p);};f={};hb(f,{type:"text/javascript",charset:"UTF-8"});Xc(e,f);Nc(e,a);Nf(c).appendChild(e);return g}function Nf(a){var b=(a||document).getElementsByTagName("HEAD");return b&&0!=b.length?b[0]:a.documentElement}function yf(){if(this&&
    this.rb){var a=this.rb;a&&"SCRIPT"==a.tagName&&Jf(a,!0,this.sb);}}function Jf(a,b,c){null!=c&&n.clearTimeout(c);a.onload=na;a.onerror=na;a.onreadystatechange=na;b&&window.setTimeout(function(){$c(a);},0);}var Mf=0,Lf=1;function Kf(a,b){var c="Jsloader error (code #"+a+")";b&&(c+=": "+b);Ca.call(this,c);this.code=a;}w(Kf,Ca);function Of(){return n.google&&n.google.accounts&&n.google.accounts.id||null}function Pf(a){this.a=a||Of();this.h=!1;this.g=null;}Pf.prototype.cancel=function(){this.a&&this.h&&(this.g&&
    this.g(null),this.a.cancel());};function Qf(a,b,c){if(a.a&&b)return function(){a.h=!0;return new F(function(e){a.g=e;a.a.initialize({client_id:b,callback:e,auto_select:!c});a.a.prompt();})}();if(b){var d=Rf.Xa().load().then(function(){a.a=Of();return Qf(a,b,c)}).Ca(function(){return null});return G(d)}return G(null)}oa(Pf);var xc=new qc(rc,"https://accounts.google.com/gsi/client");function Rf(){this.a=null;}Rf.prototype.load=function(){var a=this;if(this.a)return this.a;var b=wc();return Of()?G():this.a=
    uf().then(function(){if(!Of())return new F(function(c,d){var e=setTimeout(function(){a.a=null;d(Error("Network error!"));},1E4);n.onGoogleLibraryLoad=function(){clearTimeout(e);c();};G(If(b)).then(function(){Of()&&c();}).Ca(function(f){clearTimeout(e);a.a=null;d(f);});})})};oa(Rf);function Sf(a,b){this.a=a;this.g=b||function(c){throw c;};}Sf.prototype.confirm=function(a){return G(this.a.confirm(a)).Ca(this.g)};function Tf(a,b,c){this.reset(a,b,c,void 0,void 0);}Tf.prototype.a=null;Tf.prototype.reset=
    function(a,b,c,d,e){this.h=d||Aa();this.j=a;this.s=b;this.g=c;delete this.a;};function Vf(a){this.s=a;this.a=this.h=this.j=this.g=null;}function Wf(a,b){this.name=a;this.value=b;}Wf.prototype.toString=function(){return this.name};var Xf=new Wf("SEVERE",1E3),Yf=new Wf("WARNING",900),Zf=new Wf("CONFIG",700);function $f(a){if(a.j)return a.j;if(a.g)return $f(a.g);Fa("Root logger has no level set.");return null}Vf.prototype.log=function(a,b,c){if(a.value>=$f(this).value)for(sa(b)&&
    (b=b()),a=new Tf(a,String(b),this.s),c&&(a.a=c),c=this;c;){var d=c,e=a;if(d.a)for(var f=0;b=d.a[f];f++)b(e);c=c.g;}};var ag={},bg=null;function cg(){bg||(bg=new Vf(""),ag[""]=bg,bg.j=Zf);}function dg(a){cg();var b;if(!(b=ag[a])){b=new Vf(a);var c=a.lastIndexOf("."),d=a.substr(c+1);c=dg(a.substr(0,c));c.h||(c.h={});c.h[d]=b;b.g=c;ag[a]=b;}return b}function eg(){this.a=Aa();}var fg=null;eg.prototype.set=function(a){this.a=a;};eg.prototype.reset=function(){this.set(Aa());};eg.prototype.get=function(){return this.a};
    function gg(a){this.j=a||"";fg||(fg=new eg);this.s=fg;}gg.prototype.a=!0;gg.prototype.g=!0;gg.prototype.h=!1;function hg(a){return 10>a?"0"+a:String(a)}function ig(a,b){a=(a.h-b)/1E3;b=a.toFixed(3);var c=0;if(1>a)c=2;else for(;100>a;)c++,a*=10;for(;0<c--;)b=" "+b;return b}function jg(a){gg.call(this,a);}w(jg,gg);function kg(a,b){var c=[];c.push(a.j," ");if(a.g){var d=new Date(b.h);c.push("[",hg(d.getFullYear()-2E3)+hg(d.getMonth()+1)+hg(d.getDate())+" "+hg(d.getHours())+":"+hg(d.getMinutes())+":"+hg(d.getSeconds())+
    "."+hg(Math.floor(d.getMilliseconds()/10)),"] ");}c.push("[",ig(b,a.s.get()),"s] ");c.push("[",b.g,"] ");c.push(b.s);a.h&&(b=b.a)&&c.push("\n",b instanceof Error?b.message:b.toString());a.a&&c.push("\n");return c.join("")}function lg(){this.s=t(this.h,this);this.a=new jg;this.a.g=!1;this.a.h=!1;this.g=this.a.a=!1;this.j={};}lg.prototype.h=function(a){function b(f){if(f){if(f.value>=Xf.value)return "error";if(f.value>=Yf.value)return "warn";if(f.value>=Zf.value)return "log"}return "debug"}if(!this.j[a.g]){var c=
    kg(this.a,a),d=mg;if(d){var e=b(a.j);ng(d,e,c,a.a);}}};var mg=n.console;function ng(a,b,c,d){if(a[b])a[b](c,d||"");else a.log(c,d||"");}function og(a,b){var c=pg;c&&c.log(Xf,a,b);}var pg;pg=dg("firebaseui");var qg=new lg;if(1!=qg.g){var rg;cg();rg=bg;var sg=qg.s;rg.a||(rg.a=[]);rg.a.push(sg);qg.g=!0;}function tg(a){var b=pg;b&&b.log(Yf,a,void 0);}function vg(){this.a=("undefined"==typeof document?null:document)||{cookie:""};}l=vg.prototype;l.set=function(a,b,c,d,e,f){if(/[;=\s]/.test(a))throw Error('Invalid cookie name "'+
    a+'"');if(/[;\r\n]/.test(b))throw Error('Invalid cookie value "'+b+'"');ka(c)||(c=-1);e=e?";domain="+e:"";d=d?";path="+d:"";f=f?";secure":"";c=0>c?"":0==c?";expires="+(new Date(1970,1,1)).toUTCString():";expires="+(new Date(Aa()+1E3*c)).toUTCString();this.a.cookie=a+"="+b+e+d+c+f;};l.get=function(a,b){for(var c=a+"=",d=(this.a.cookie||"").split(";"),e=0,f;e<d.length;e++){f=Va(d[e]);if(0==f.lastIndexOf(c,0))return f.substr(c.length);if(f==a)return ""}return b};l.ja=function(){return wg(this).keys};l.la=
    function(){return wg(this).values};l.clear=function(){for(var a=wg(this).keys,b=a.length-1;0<=b;b--){var c=a[b];this.get(c);this.set(c,"",0,void 0,void 0);}};function wg(a){a=(a.a.cookie||"").split(";");for(var b=[],c=[],d,e,f=0;f<a.length;f++)e=Va(a[f]),d=e.indexOf("="),-1==d?(b.push(""),c.push(e)):(b.push(e.substring(0,d)),c.push(e.substring(d+1)));return {keys:b,values:c}}var xg=new vg;function yg(){}function zg(a,b,c,d){this.h="undefined"!==typeof a&&null!==a?a:-1;this.g=b||null;this.a=c||null;
    this.j=!!d;}m(zg,yg);zg.prototype.set=function(a,b){xg.set(a,b,this.h,this.g,this.a,this.j);};zg.prototype.get=function(a){return xg.get(a)||null};zg.prototype.ra=function(a){var b=this.g,c=this.a;xg.get(a);xg.set(a,"",0,b,c);};function Ag(a,b){this.g=a;this.a=b||null;}function Bg(a){return {email:a.g,credential:a.a&&a.a.toJSON()}}function Cg(a){if(a&&a.email){var b=a.credential&&index_cjs$3.auth.AuthCredential.fromJSON(a.credential);return new Ag(a.email,b)}return null}function Dg(a){this.a=a||null;}function Eg(a){for(var b=
    [],c=0,d=0;d<a.length;d++){var e=a.charCodeAt(d);255<e&&(b[c++]=e&255,e>>=8);b[c++]=e;}return b}function Fg(a){return Ka(a,function(b){b=b.toString(16);return 1<b.length?b:"0"+b}).join("")}function Gg(a){this.i=a;this.g=this.i.length/4;this.j=this.g+6;this.h=[[],[],[],[]];this.s=[[],[],[],[]];this.a=Array(Hg*(this.j+1));for(a=0;a<this.g;a++)this.a[a]=[this.i[4*a],this.i[4*a+1],this.i[4*a+2],this.i[4*a+3]];var b=Array(4);for(a=this.g;a<Hg*(this.j+1);a++){b[0]=this.a[a-1][0];b[1]=this.a[a-1][1];b[2]=
    this.a[a-1][2];b[3]=this.a[a-1][3];if(0==a%this.g){var c=b,d=c[0];c[0]=c[1];c[1]=c[2];c[2]=c[3];c[3]=d;Ig(b);b[0]^=Jg[a/this.g][0];b[1]^=Jg[a/this.g][1];b[2]^=Jg[a/this.g][2];b[3]^=Jg[a/this.g][3];}else 6<this.g&&4==a%this.g&&Ig(b);this.a[a]=Array(4);this.a[a][0]=this.a[a-this.g][0]^b[0];this.a[a][1]=this.a[a-this.g][1]^b[1];this.a[a][2]=this.a[a-this.g][2]^b[2];this.a[a][3]=this.a[a-this.g][3]^b[3];}}Gg.prototype.A=16;var Hg=Gg.prototype.A/4;function Kg(a,b){for(var c,d=0;d<Hg;d++)for(var e=0;4>e;e++)c=
    4*e+d,c=b[c],a.h[d][e]=c;}function Lg(a){for(var b=[],c=0;c<Hg;c++)for(var d=0;4>d;d++)b[4*d+c]=a.h[c][d];return b}function Mg(a,b){for(var c=0;4>c;c++)for(var d=0;4>d;d++)a.h[c][d]^=a.a[4*b+d][c];}function Ng(a,b){for(var c=0;4>c;c++)for(var d=0;4>d;d++)a.h[c][d]=b[a.h[c][d]];}function Og(a){for(var b=1;4>b;b++)for(var c=0;4>c;c++)a.s[b][c]=a.h[b][c];for(b=1;4>b;b++)for(c=0;4>c;c++)a.h[b][c]=a.s[b][(c+b)%Hg];}function Pg(a){for(var b=1;4>b;b++)for(var c=0;4>c;c++)a.s[b][(c+b)%Hg]=a.h[b][c];for(b=1;4>
    b;b++)for(c=0;4>c;c++)a.h[b][c]=a.s[b][c];}function Ig(a){a[0]=Qg[a[0]];a[1]=Qg[a[1]];a[2]=Qg[a[2]];a[3]=Qg[a[3]];}var Qg=[99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,208,239,170,251,67,77,51,133,69,249,2,
    127,80,60,159,168,81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,137,13,191,230,66,
    104,65,153,45,15,176,84,187,22],Rg=[82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37,114,248,246,100,134,104,152,22,212,164,92,204,93,101,182,146,108,112,72,80,253,237,185,218,94,21,70,87,167,141,157,132,144,216,171,0,140,188,211,10,247,228,88,5,184,179,69,6,208,44,30,143,202,63,15,2,193,175,189,3,1,19,138,107,58,145,17,
    65,79,103,220,234,151,242,207,206,240,180,230,115,150,172,116,34,231,173,53,133,226,249,55,232,28,117,223,110,71,241,26,113,29,41,197,137,111,183,98,14,170,24,190,27,252,86,62,75,198,210,121,32,154,219,192,254,120,205,90,244,31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125],Jg=[[0,0,0,0],[1,0,0,0],[2,0,0,0],[4,0,0,0],[8,0,0,
    0],[16,0,0,0],[32,0,0,0],[64,0,0,0],[128,0,0,0],[27,0,0,0],[54,0,0,0]],Sg=[0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,86,88,90,92,94,96,98,100,102,104,106,108,110,112,114,116,118,120,122,124,126,128,130,132,134,136,138,140,142,144,146,148,150,152,154,156,158,160,162,164,166,168,170,172,174,176,178,180,182,184,186,188,190,192,194,196,198,200,202,204,206,208,210,212,214,216,218,220,222,224,226,228,230,232,234,236,238,240,
    242,244,246,248,250,252,254,27,25,31,29,19,17,23,21,11,9,15,13,3,1,7,5,59,57,63,61,51,49,55,53,43,41,47,45,35,33,39,37,91,89,95,93,83,81,87,85,75,73,79,77,67,65,71,69,123,121,127,125,115,113,119,117,107,105,111,109,99,97,103,101,155,153,159,157,147,145,151,149,139,137,143,141,131,129,135,133,187,185,191,189,179,177,183,181,171,169,175,173,163,161,167,165,219,217,223,221,211,209,215,213,203,201,207,205,195,193,199,197,251,249,255,253,243,241,247,245,235,233,239,237,227,225,231,229],Tg=[0,3,6,5,12,
    15,10,9,24,27,30,29,20,23,18,17,48,51,54,53,60,63,58,57,40,43,46,45,36,39,34,33,96,99,102,101,108,111,106,105,120,123,126,125,116,119,114,113,80,83,86,85,92,95,90,89,72,75,78,77,68,71,66,65,192,195,198,197,204,207,202,201,216,219,222,221,212,215,210,209,240,243,246,245,252,255,250,249,232,235,238,237,228,231,226,225,160,163,166,165,172,175,170,169,184,187,190,189,180,183,178,177,144,147,150,149,156,159,154,153,136,139,142,141,132,135,130,129,155,152,157,158,151,148,145,146,131,128,133,134,143,140,
    137,138,171,168,173,174,167,164,161,162,179,176,181,182,191,188,185,186,251,248,253,254,247,244,241,242,227,224,229,230,239,236,233,234,203,200,205,206,199,196,193,194,211,208,213,214,223,220,217,218,91,88,93,94,87,84,81,82,67,64,69,70,79,76,73,74,107,104,109,110,103,100,97,98,115,112,117,118,127,124,121,122,59,56,61,62,55,52,49,50,35,32,37,38,47,44,41,42,11,8,13,14,7,4,1,2,19,16,21,22,31,28,25,26],Ug=[0,9,18,27,36,45,54,63,72,65,90,83,108,101,126,119,144,153,130,139,180,189,166,175,216,209,202,195,
    252,245,238,231,59,50,41,32,31,22,13,4,115,122,97,104,87,94,69,76,171,162,185,176,143,134,157,148,227,234,241,248,199,206,213,220,118,127,100,109,82,91,64,73,62,55,44,37,26,19,8,1,230,239,244,253,194,203,208,217,174,167,188,181,138,131,152,145,77,68,95,86,105,96,123,114,5,12,23,30,33,40,51,58,221,212,207,198,249,240,235,226,149,156,135,142,177,184,163,170,236,229,254,247,200,193,218,211,164,173,182,191,128,137,146,155,124,117,110,103,88,81,74,67,52,61,38,47,16,25,2,11,215,222,197,204,243,250,225,
    232,159,150,141,132,187,178,169,160,71,78,85,92,99,106,113,120,15,6,29,20,43,34,57,48,154,147,136,129,190,183,172,165,210,219,192,201,246,255,228,237,10,3,24,17,46,39,60,53,66,75,80,89,102,111,116,125,161,168,179,186,133,140,151,158,233,224,251,242,205,196,223,214,49,56,35,42,21,28,7,14,121,112,107,98,93,84,79,70],Vg=[0,11,22,29,44,39,58,49,88,83,78,69,116,127,98,105,176,187,166,173,156,151,138,129,232,227,254,245,196,207,210,217,123,112,109,102,87,92,65,74,35,40,53,62,15,4,25,18,203,192,221,214,
    231,236,241,250,147,152,133,142,191,180,169,162,246,253,224,235,218,209,204,199,174,165,184,179,130,137,148,159,70,77,80,91,106,97,124,119,30,21,8,3,50,57,36,47,141,134,155,144,161,170,183,188,213,222,195,200,249,242,239,228,61,54,43,32,17,26,7,12,101,110,115,120,73,66,95,84,247,252,225,234,219,208,205,198,175,164,185,178,131,136,149,158,71,76,81,90,107,96,125,118,31,20,9,2,51,56,37,46,140,135,154,145,160,171,182,189,212,223,194,201,248,243,238,229,60,55,42,33,16,27,6,13,100,111,114,121,72,67,94,
    85,1,10,23,28,45,38,59,48,89,82,79,68,117,126,99,104,177,186,167,172,157,150,139,128,233,226,255,244,197,206,211,216,122,113,108,103,86,93,64,75,34,41,52,63,14,5,24,19,202,193,220,215,230,237,240,251,146,153,132,143,190,181,168,163],Wg=[0,13,26,23,52,57,46,35,104,101,114,127,92,81,70,75,208,221,202,199,228,233,254,243,184,181,162,175,140,129,150,155,187,182,161,172,143,130,149,152,211,222,201,196,231,234,253,240,107,102,113,124,95,82,69,72,3,14,25,20,55,58,45,32,109,96,119,122,89,84,67,78,5,8,31,
    18,49,60,43,38,189,176,167,170,137,132,147,158,213,216,207,194,225,236,251,246,214,219,204,193,226,239,248,245,190,179,164,169,138,135,144,157,6,11,28,17,50,63,40,37,110,99,116,121,90,87,64,77,218,215,192,205,238,227,244,249,178,191,168,165,134,139,156,145,10,7,16,29,62,51,36,41,98,111,120,117,86,91,76,65,97,108,123,118,85,88,79,66,9,4,19,30,61,48,39,42,177,188,171,166,133,136,159,146,217,212,195,206,237,224,247,250,183,186,173,160,131,142,153,148,223,210,197,200,235,230,241,252,103,106,125,112,83,
    94,73,68,15,2,21,24,59,54,33,44,12,1,22,27,56,53,34,47,100,105,126,115,80,93,74,71,220,209,198,203,232,229,242,255,180,185,174,163,128,141,154,151],Xg=[0,14,28,18,56,54,36,42,112,126,108,98,72,70,84,90,224,238,252,242,216,214,196,202,144,158,140,130,168,166,180,186,219,213,199,201,227,237,255,241,171,165,183,185,147,157,143,129,59,53,39,41,3,13,31,17,75,69,87,89,115,125,111,97,173,163,177,191,149,155,137,135,221,211,193,207,229,235,249,247,77,67,81,95,117,123,105,103,61,51,33,47,5,11,25,23,118,120,
    106,100,78,64,82,92,6,8,26,20,62,48,34,44,150,152,138,132,174,160,178,188,230,232,250,244,222,208,194,204,65,79,93,83,121,119,101,107,49,63,45,35,9,7,21,27,161,175,189,179,153,151,133,139,209,223,205,195,233,231,245,251,154,148,134,136,162,172,190,176,234,228,246,248,210,220,206,192,122,116,102,104,66,76,94,80,10,4,22,24,50,60,46,32,236,226,240,254,212,218,200,198,156,146,128,142,164,170,184,182,12,2,16,30,52,58,40,38,124,114,96,110,68,74,88,86,55,57,43,37,15,1,19,29,71,73,91,85,127,113,99,109,215,
    217,203,197,239,225,243,253,167,169,187,181,159,145,131,141];function Yg(a,b){a=new Gg(Zg(a));b=Eg(b);for(var c=Ta(b,0,16),d="",e;c.length;){e=16-c.length;for(var f=0;f<e;f++)c.push(0);e=a;Kg(e,c);Mg(e,0);for(c=1;c<e.j;++c){Ng(e,Qg);Og(e);f=e.h;for(var g=e.s[0],h=0;4>h;h++)g[0]=f[0][h],g[1]=f[1][h],g[2]=f[2][h],g[3]=f[3][h],f[0][h]=Sg[g[0]]^Tg[g[1]]^g[2]^g[3],f[1][h]=g[0]^Sg[g[1]]^Tg[g[2]]^g[3],f[2][h]=g[0]^g[1]^Sg[g[2]]^Tg[g[3]],f[3][h]=Tg[g[0]]^g[1]^g[2]^Sg[g[3]];Mg(e,c);}Ng(e,Qg);Og(e);Mg(e,e.j);
    d+=Fg(Lg(e));c=Ta(b,0,16);}return d}function $g(a,b){a=new Gg(Zg(a));for(var c=[],d=0;d<b.length;d+=2)c.push(parseInt(b.substring(d,d+2),16));var e=Ta(c,0,16);for(b="";e.length;){d=a;Kg(d,e);Mg(d,d.j);for(e=1;e<d.j;++e){Pg(d);Ng(d,Rg);Mg(d,d.j-e);for(var f=d.h,g=d.s[0],h=0;4>h;h++)g[0]=f[0][h],g[1]=f[1][h],g[2]=f[2][h],g[3]=f[3][h],f[0][h]=Xg[g[0]]^Vg[g[1]]^Wg[g[2]]^Ug[g[3]],f[1][h]=Ug[g[0]]^Xg[g[1]]^Vg[g[2]]^Wg[g[3]],f[2][h]=Wg[g[0]]^Ug[g[1]]^Xg[g[2]]^Vg[g[3]],f[3][h]=Vg[g[0]]^Wg[g[1]]^Ug[g[2]]^Xg[g[3]];}Pg(d);
    Ng(d,Rg);Mg(d,0);d=Lg(d);if(8192>=d.length)d=String.fromCharCode.apply(null,d);else {e="";for(f=0;f<d.length;f+=8192)e+=String.fromCharCode.apply(null,Ua(d,f,f+8192));d=e;}b+=d;e=Ta(c,0,16);}return b.replace(/(\x00)+$/,"")}function Zg(a){a=Eg(a.substring(0,32));for(var b=32-a.length,c=0;c<b;c++)a.push(0);return a}function ah(a){var b=[];bh(new ch,a,b);return b.join("")}function ch(){}function bh(a,b,c){if(null==b)c.push("null");else {if("object"==typeof b){if(qa(b)){var d=b;b=d.length;c.push("[");for(var e=
    "",f=0;f<b;f++)c.push(e),bh(a,d[f],c),e=",";c.push("]");return}if(b instanceof String||b instanceof Number||b instanceof Boolean)b=b.valueOf();else {c.push("{");e="";for(d in b)Object.prototype.hasOwnProperty.call(b,d)&&(f=b[d],"function"!=typeof f&&(c.push(e),dh(d,c),c.push(":"),bh(a,f,c),e=","));c.push("}");return}}switch(typeof b){case "string":dh(b,c);break;case "number":c.push(isFinite(b)&&!isNaN(b)?String(b):"null");break;case "boolean":c.push(String(b));break;case "function":c.push("null");
    break;default:throw Error("Unknown type: "+typeof b);}}}var eh={'"':'\\"',"\\":"\\\\","/":"\\/","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\x0B":"\\u000b"},fh=/\uffff/.test("\uffff")?/[\\"\x00-\x1f\x7f-\uffff]/g:/[\\"\x00-\x1f\x7f-\xff]/g;function dh(a,b){b.push('"',a.replace(fh,function(c){var d=eh[c];d||(d="\\u"+(c.charCodeAt(0)|65536).toString(16).substr(1),eh[c]=d);return d}),'"');}function gh(a){this.a=a;}gh.prototype.set=function(a,b){ka(b)?this.a.set(a,ah(b)):this.a.ra(a);};gh.prototype.get=
    function(a){try{var b=this.a.get(a);}catch(c){return}if(null!==b)try{return JSON.parse(b)}catch(c$2){throw "Storage: Invalid value was encountered";}};function hh(){}w(hh,yg);hh.prototype.clear=function(){var a=mb(this.ha(!0)),b=this;Ha(a,function(c){b.ra(c);});};function ih(a){this.a=a;}w(ih,hh);function jh(a){if(!a.a)return !1;try{return a.a.setItem("__sak","1"),a.a.removeItem("__sak"),!0}catch(b){return !1}}l=ih.prototype;l.set=function(a,b){try{this.a.setItem(a,b);}catch(c){if(0==this.a.length)throw "Storage mechanism: Storage disabled";
    throw "Storage mechanism: Quota exceeded";}};l.get=function(a){a=this.a.getItem(a);if(!q(a)&&null!==a)throw "Storage mechanism: Invalid value was encountered";return a};l.ra=function(a){this.a.removeItem(a);};l.ha=function(a){var b=0,c=this.a,d=new jb;d.next=function(){if(b>=c.length)throw ib;var e=c.key(b++);if(a)return e;e=c.getItem(e);if(!q(e))throw "Storage mechanism: Invalid value was encountered";return e};return d};l.clear=function(){this.a.clear();};l.key=function(a){return this.a.key(a)};function kh(){var a=
    null;try{a=window.localStorage||null;}catch(b){}this.a=a;}w(kh,ih);function lh(){var a=null;try{a=window.sessionStorage||null;}catch(b){}this.a=a;}w(lh,ih);function mh(a,b){this.g=a;this.a=b+"::";}w(mh,hh);mh.prototype.set=function(a,b){this.g.set(this.a+a,b);};mh.prototype.get=function(a){return this.g.get(this.a+a)};mh.prototype.ra=function(a){this.g.ra(this.a+a);};mh.prototype.ha=function(a){var b=this.g.ha(!0),c=this,d=new jb;d.next=function(){for(var e=b.next();e.substr(0,c.a.length)!=c.a;)e=b.next();
    return a?e.substr(c.a.length):c.g.get(e)};return d};jh(new kh);var nh,oh=new lh;nh=jh(oh)?new mh(oh,"firebaseui"):null;var ph=new gh(nh),qh={name:"pendingEmailCredential",storage:ph},rh={name:"redirectStatus",storage:ph},sh={name:"redirectUrl",storage:ph},th={name:"emailForSignIn",storage:new gh(new zg(3600,"/"))},uh={name:"pendingEncryptedCredential",storage:new gh(new zg(3600,"/"))};function vh(a,b){return a.storage.get(b?a.name+":"+b:a.name)}function wh(a,b){a.storage.a.ra(b?a.name+":"+b:a.name);}
    function xh(a,b,c){a.storage.set(c?a.name+":"+c:a.name,b);}function yh(a){return vh(sh,a)||null}function zh(a){a=vh(qh,a)||null;return Cg(a)}function Ah(a){wh(qh,a);}function Bh(a,b){xh(qh,Bg(a),b);}function Ch(a){return (a=vh(rh,a)||null)&&"undefined"!==typeof a.tenantId?new Dg(a.tenantId):null}function Dh(a,b){xh(rh,{tenantId:a.a},b);}function Eh(a,b){b=vh(th,b);var c=null;if(b)try{var d=$g(a,b),e=JSON.parse(d);c=e&&e.email||null;}catch(f){}return c}function Fh(a,b){b=vh(uh,b);var c=null;if(b)try{var d=
    $g(a,b);c=JSON.parse(d);}catch(e){}return Cg(c||null)}function Gh(a,b,c){xh(uh,Yg(a,JSON.stringify(Bg(b))),c);}function Hh(){this.W={};}function I(a,b,c){if(b.toLowerCase()in a.W)throw Error("Configuration "+b+" has already been defined.");a.W[b.toLowerCase()]=c;}function Ih(a,b,c){if(!(b.toLowerCase()in a.W))throw Error("Configuration "+b+" is not defined.");a.W[b.toLowerCase()]=c;}Hh.prototype.get=function(a){if(!(a.toLowerCase()in this.W))throw Error("Configuration "+a+" is not defined.");return this.W[a.toLowerCase()]};
    function Jh(a,b){a=a.get(b);if(!a)throw Error("Configuration "+b+" is required.");return a}function Kh(){this.g=void 0;this.a={};}l=Kh.prototype;l.set=function(a,b){Lh(this,a,b,!1);};l.add=function(a,b){Lh(this,a,b,!0);};function Lh(a,b,c,d){for(var e=0;e<b.length;e++){var f=b.charAt(e);a.a[f]||(a.a[f]=new Kh);a=a.a[f];}if(d&&void 0!==a.g)throw Error('The collection already contains the key "'+b+'"');a.g=c;}l.get=function(a){a:{for(var b=this,c=0;c<a.length;c++)if(b=b.a[a.charAt(c)],!b){a=void 0;break a}a=
    b;}return a?a.g:void 0};l.la=function(){var a=[];Mh(this,a);return a};function Mh(a,b){void 0!==a.g&&b.push(a.g);for(var c in a.a)Mh(a.a[c],b);}l.ja=function(){var a=[];Nh(this,"",a);return a};function Nh(a,b,c){void 0!==a.g&&c.push(b);for(var d in a.a)Nh(a.a[d],b+d,c);}l.clear=function(){this.a={};this.g=void 0;};function Oh(a){this.a=a;this.g=new Kh;for(a=0;a<this.a.length;a++){var b=this.g.get("+"+this.a[a].b);b?b.push(this.a[a]):this.g.add("+"+this.a[a].b,[this.a[a]]);}}function Ph(a,b){a=a.g;var c=
    {},d=0;void 0!==a.g&&(c[d]=a.g);for(;d<b.length;d++){var e=b.charAt(d);if(!(e in a.a))break;a=a.a[e];void 0!==a.g&&(c[d]=a.g);}for(var f in c)if(c.hasOwnProperty(f))return c[f];return []}function Qh(a){for(var b=0;b<Rh.length;b++)if(Rh[b].c===a)return Rh[b];return null}function Sh(a){a=a.toUpperCase();for(var b=[],c=0;c<Rh.length;c++)Rh[c].f===a&&b.push(Rh[c]);return b}function Th(a){if(0<a.length&&"+"==a.charAt(0)){a=a.substring(1);for(var b=[],c=0;c<Rh.length;c++)Rh[c].b==a&&b.push(Rh[c]);a=b;}else a=
    Sh(a);return a}function Uh(a){a.sort(function(b,c){return b.name.localeCompare(c.name,"en")});}var Rh=[{name:"Afghanistan",c:"93-AF-0",b:"93",f:"AF"},{name:"\u00c5land Islands",c:"358-AX-0",b:"358",f:"AX"},{name:"Albania",c:"355-AL-0",b:"355",f:"AL"},{name:"Algeria",c:"213-DZ-0",b:"213",f:"DZ"},{name:"American Samoa",c:"1-AS-0",b:"1",f:"AS"},{name:"Andorra",c:"376-AD-0",b:"376",f:"AD"},{name:"Angola",c:"244-AO-0",b:"244",f:"AO"},{name:"Anguilla",c:"1-AI-0",b:"1",f:"AI"},{name:"Antigua and Barbuda",
    c:"1-AG-0",b:"1",f:"AG"},{name:"Argentina",c:"54-AR-0",b:"54",f:"AR"},{name:"Armenia",c:"374-AM-0",b:"374",f:"AM"},{name:"Aruba",c:"297-AW-0",b:"297",f:"AW"},{name:"Ascension Island",c:"247-AC-0",b:"247",f:"AC"},{name:"Australia",c:"61-AU-0",b:"61",f:"AU"},{name:"Austria",c:"43-AT-0",b:"43",f:"AT"},{name:"Azerbaijan",c:"994-AZ-0",b:"994",f:"AZ"},{name:"Bahamas",c:"1-BS-0",b:"1",f:"BS"},{name:"Bahrain",c:"973-BH-0",b:"973",f:"BH"},{name:"Bangladesh",c:"880-BD-0",b:"880",f:"BD"},{name:"Barbados",c:"1-BB-0",
    b:"1",f:"BB"},{name:"Belarus",c:"375-BY-0",b:"375",f:"BY"},{name:"Belgium",c:"32-BE-0",b:"32",f:"BE"},{name:"Belize",c:"501-BZ-0",b:"501",f:"BZ"},{name:"Benin",c:"229-BJ-0",b:"229",f:"BJ"},{name:"Bermuda",c:"1-BM-0",b:"1",f:"BM"},{name:"Bhutan",c:"975-BT-0",b:"975",f:"BT"},{name:"Bolivia",c:"591-BO-0",b:"591",f:"BO"},{name:"Bosnia and Herzegovina",c:"387-BA-0",b:"387",f:"BA"},{name:"Botswana",c:"267-BW-0",b:"267",f:"BW"},{name:"Brazil",c:"55-BR-0",b:"55",f:"BR"},{name:"British Indian Ocean Territory",
    c:"246-IO-0",b:"246",f:"IO"},{name:"British Virgin Islands",c:"1-VG-0",b:"1",f:"VG"},{name:"Brunei",c:"673-BN-0",b:"673",f:"BN"},{name:"Bulgaria",c:"359-BG-0",b:"359",f:"BG"},{name:"Burkina Faso",c:"226-BF-0",b:"226",f:"BF"},{name:"Burundi",c:"257-BI-0",b:"257",f:"BI"},{name:"Cambodia",c:"855-KH-0",b:"855",f:"KH"},{name:"Cameroon",c:"237-CM-0",b:"237",f:"CM"},{name:"Canada",c:"1-CA-0",b:"1",f:"CA"},{name:"Cape Verde",c:"238-CV-0",b:"238",f:"CV"},{name:"Caribbean Netherlands",c:"599-BQ-0",b:"599",
    f:"BQ"},{name:"Cayman Islands",c:"1-KY-0",b:"1",f:"KY"},{name:"Central African Republic",c:"236-CF-0",b:"236",f:"CF"},{name:"Chad",c:"235-TD-0",b:"235",f:"TD"},{name:"Chile",c:"56-CL-0",b:"56",f:"CL"},{name:"China",c:"86-CN-0",b:"86",f:"CN"},{name:"Christmas Island",c:"61-CX-0",b:"61",f:"CX"},{name:"Cocos [Keeling] Islands",c:"61-CC-0",b:"61",f:"CC"},{name:"Colombia",c:"57-CO-0",b:"57",f:"CO"},{name:"Comoros",c:"269-KM-0",b:"269",f:"KM"},{name:"Democratic Republic Congo",c:"243-CD-0",b:"243",f:"CD"},
    {name:"Republic of Congo",c:"242-CG-0",b:"242",f:"CG"},{name:"Cook Islands",c:"682-CK-0",b:"682",f:"CK"},{name:"Costa Rica",c:"506-CR-0",b:"506",f:"CR"},{name:"C\u00f4te d'Ivoire",c:"225-CI-0",b:"225",f:"CI"},{name:"Croatia",c:"385-HR-0",b:"385",f:"HR"},{name:"Cuba",c:"53-CU-0",b:"53",f:"CU"},{name:"Cura\u00e7ao",c:"599-CW-0",b:"599",f:"CW"},{name:"Cyprus",c:"357-CY-0",b:"357",f:"CY"},{name:"Czech Republic",c:"420-CZ-0",b:"420",f:"CZ"},{name:"Denmark",c:"45-DK-0",b:"45",f:"DK"},{name:"Djibouti",c:"253-DJ-0",
    b:"253",f:"DJ"},{name:"Dominica",c:"1-DM-0",b:"1",f:"DM"},{name:"Dominican Republic",c:"1-DO-0",b:"1",f:"DO"},{name:"East Timor",c:"670-TL-0",b:"670",f:"TL"},{name:"Ecuador",c:"593-EC-0",b:"593",f:"EC"},{name:"Egypt",c:"20-EG-0",b:"20",f:"EG"},{name:"El Salvador",c:"503-SV-0",b:"503",f:"SV"},{name:"Equatorial Guinea",c:"240-GQ-0",b:"240",f:"GQ"},{name:"Eritrea",c:"291-ER-0",b:"291",f:"ER"},{name:"Estonia",c:"372-EE-0",b:"372",f:"EE"},{name:"Ethiopia",c:"251-ET-0",b:"251",f:"ET"},{name:"Falkland Islands [Islas Malvinas]",
    c:"500-FK-0",b:"500",f:"FK"},{name:"Faroe Islands",c:"298-FO-0",b:"298",f:"FO"},{name:"Fiji",c:"679-FJ-0",b:"679",f:"FJ"},{name:"Finland",c:"358-FI-0",b:"358",f:"FI"},{name:"France",c:"33-FR-0",b:"33",f:"FR"},{name:"French Guiana",c:"594-GF-0",b:"594",f:"GF"},{name:"French Polynesia",c:"689-PF-0",b:"689",f:"PF"},{name:"Gabon",c:"241-GA-0",b:"241",f:"GA"},{name:"Gambia",c:"220-GM-0",b:"220",f:"GM"},{name:"Georgia",c:"995-GE-0",b:"995",f:"GE"},{name:"Germany",c:"49-DE-0",b:"49",f:"DE"},{name:"Ghana",
    c:"233-GH-0",b:"233",f:"GH"},{name:"Gibraltar",c:"350-GI-0",b:"350",f:"GI"},{name:"Greece",c:"30-GR-0",b:"30",f:"GR"},{name:"Greenland",c:"299-GL-0",b:"299",f:"GL"},{name:"Grenada",c:"1-GD-0",b:"1",f:"GD"},{name:"Guadeloupe",c:"590-GP-0",b:"590",f:"GP"},{name:"Guam",c:"1-GU-0",b:"1",f:"GU"},{name:"Guatemala",c:"502-GT-0",b:"502",f:"GT"},{name:"Guernsey",c:"44-GG-0",b:"44",f:"GG"},{name:"Guinea Conakry",c:"224-GN-0",b:"224",f:"GN"},{name:"Guinea-Bissau",c:"245-GW-0",b:"245",f:"GW"},{name:"Guyana",
    c:"592-GY-0",b:"592",f:"GY"},{name:"Haiti",c:"509-HT-0",b:"509",f:"HT"},{name:"Heard Island and McDonald Islands",c:"672-HM-0",b:"672",f:"HM"},{name:"Honduras",c:"504-HN-0",b:"504",f:"HN"},{name:"Hong Kong",c:"852-HK-0",b:"852",f:"HK"},{name:"Hungary",c:"36-HU-0",b:"36",f:"HU"},{name:"Iceland",c:"354-IS-0",b:"354",f:"IS"},{name:"India",c:"91-IN-0",b:"91",f:"IN"},{name:"Indonesia",c:"62-ID-0",b:"62",f:"ID"},{name:"Iran",c:"98-IR-0",b:"98",f:"IR"},{name:"Iraq",c:"964-IQ-0",b:"964",f:"IQ"},{name:"Ireland",
    c:"353-IE-0",b:"353",f:"IE"},{name:"Isle of Man",c:"44-IM-0",b:"44",f:"IM"},{name:"Israel",c:"972-IL-0",b:"972",f:"IL"},{name:"Italy",c:"39-IT-0",b:"39",f:"IT"},{name:"Jamaica",c:"1-JM-0",b:"1",f:"JM"},{name:"Japan",c:"81-JP-0",b:"81",f:"JP"},{name:"Jersey",c:"44-JE-0",b:"44",f:"JE"},{name:"Jordan",c:"962-JO-0",b:"962",f:"JO"},{name:"Kazakhstan",c:"7-KZ-0",b:"7",f:"KZ"},{name:"Kenya",c:"254-KE-0",b:"254",f:"KE"},{name:"Kiribati",c:"686-KI-0",b:"686",f:"KI"},{name:"Kosovo",c:"377-XK-0",b:"377",f:"XK"},
    {name:"Kosovo",c:"381-XK-0",b:"381",f:"XK"},{name:"Kosovo",c:"386-XK-0",b:"386",f:"XK"},{name:"Kuwait",c:"965-KW-0",b:"965",f:"KW"},{name:"Kyrgyzstan",c:"996-KG-0",b:"996",f:"KG"},{name:"Laos",c:"856-LA-0",b:"856",f:"LA"},{name:"Latvia",c:"371-LV-0",b:"371",f:"LV"},{name:"Lebanon",c:"961-LB-0",b:"961",f:"LB"},{name:"Lesotho",c:"266-LS-0",b:"266",f:"LS"},{name:"Liberia",c:"231-LR-0",b:"231",f:"LR"},{name:"Libya",c:"218-LY-0",b:"218",f:"LY"},{name:"Liechtenstein",c:"423-LI-0",b:"423",f:"LI"},{name:"Lithuania",
    c:"370-LT-0",b:"370",f:"LT"},{name:"Luxembourg",c:"352-LU-0",b:"352",f:"LU"},{name:"Macau",c:"853-MO-0",b:"853",f:"MO"},{name:"Macedonia",c:"389-MK-0",b:"389",f:"MK"},{name:"Madagascar",c:"261-MG-0",b:"261",f:"MG"},{name:"Malawi",c:"265-MW-0",b:"265",f:"MW"},{name:"Malaysia",c:"60-MY-0",b:"60",f:"MY"},{name:"Maldives",c:"960-MV-0",b:"960",f:"MV"},{name:"Mali",c:"223-ML-0",b:"223",f:"ML"},{name:"Malta",c:"356-MT-0",b:"356",f:"MT"},{name:"Marshall Islands",c:"692-MH-0",b:"692",f:"MH"},{name:"Martinique",
    c:"596-MQ-0",b:"596",f:"MQ"},{name:"Mauritania",c:"222-MR-0",b:"222",f:"MR"},{name:"Mauritius",c:"230-MU-0",b:"230",f:"MU"},{name:"Mayotte",c:"262-YT-0",b:"262",f:"YT"},{name:"Mexico",c:"52-MX-0",b:"52",f:"MX"},{name:"Micronesia",c:"691-FM-0",b:"691",f:"FM"},{name:"Moldova",c:"373-MD-0",b:"373",f:"MD"},{name:"Monaco",c:"377-MC-0",b:"377",f:"MC"},{name:"Mongolia",c:"976-MN-0",b:"976",f:"MN"},{name:"Montenegro",c:"382-ME-0",b:"382",f:"ME"},{name:"Montserrat",c:"1-MS-0",b:"1",f:"MS"},{name:"Morocco",
    c:"212-MA-0",b:"212",f:"MA"},{name:"Mozambique",c:"258-MZ-0",b:"258",f:"MZ"},{name:"Myanmar [Burma]",c:"95-MM-0",b:"95",f:"MM"},{name:"Namibia",c:"264-NA-0",b:"264",f:"NA"},{name:"Nauru",c:"674-NR-0",b:"674",f:"NR"},{name:"Nepal",c:"977-NP-0",b:"977",f:"NP"},{name:"Netherlands",c:"31-NL-0",b:"31",f:"NL"},{name:"New Caledonia",c:"687-NC-0",b:"687",f:"NC"},{name:"New Zealand",c:"64-NZ-0",b:"64",f:"NZ"},{name:"Nicaragua",c:"505-NI-0",b:"505",f:"NI"},{name:"Niger",c:"227-NE-0",b:"227",f:"NE"},{name:"Nigeria",
    c:"234-NG-0",b:"234",f:"NG"},{name:"Niue",c:"683-NU-0",b:"683",f:"NU"},{name:"Norfolk Island",c:"672-NF-0",b:"672",f:"NF"},{name:"North Korea",c:"850-KP-0",b:"850",f:"KP"},{name:"Northern Mariana Islands",c:"1-MP-0",b:"1",f:"MP"},{name:"Norway",c:"47-NO-0",b:"47",f:"NO"},{name:"Oman",c:"968-OM-0",b:"968",f:"OM"},{name:"Pakistan",c:"92-PK-0",b:"92",f:"PK"},{name:"Palau",c:"680-PW-0",b:"680",f:"PW"},{name:"Palestinian Territories",c:"970-PS-0",b:"970",f:"PS"},{name:"Panama",c:"507-PA-0",b:"507",f:"PA"},
    {name:"Papua New Guinea",c:"675-PG-0",b:"675",f:"PG"},{name:"Paraguay",c:"595-PY-0",b:"595",f:"PY"},{name:"Peru",c:"51-PE-0",b:"51",f:"PE"},{name:"Philippines",c:"63-PH-0",b:"63",f:"PH"},{name:"Poland",c:"48-PL-0",b:"48",f:"PL"},{name:"Portugal",c:"351-PT-0",b:"351",f:"PT"},{name:"Puerto Rico",c:"1-PR-0",b:"1",f:"PR"},{name:"Qatar",c:"974-QA-0",b:"974",f:"QA"},{name:"R\u00e9union",c:"262-RE-0",b:"262",f:"RE"},{name:"Romania",c:"40-RO-0",b:"40",f:"RO"},{name:"Russia",c:"7-RU-0",b:"7",f:"RU"},{name:"Rwanda",
    c:"250-RW-0",b:"250",f:"RW"},{name:"Saint Barth\u00e9lemy",c:"590-BL-0",b:"590",f:"BL"},{name:"Saint Helena",c:"290-SH-0",b:"290",f:"SH"},{name:"St. Kitts",c:"1-KN-0",b:"1",f:"KN"},{name:"St. Lucia",c:"1-LC-0",b:"1",f:"LC"},{name:"Saint Martin",c:"590-MF-0",b:"590",f:"MF"},{name:"Saint Pierre and Miquelon",c:"508-PM-0",b:"508",f:"PM"},{name:"St. Vincent",c:"1-VC-0",b:"1",f:"VC"},{name:"Samoa",c:"685-WS-0",b:"685",f:"WS"},{name:"San Marino",c:"378-SM-0",b:"378",f:"SM"},{name:"S\u00e3o Tom\u00e9 and Pr\u00edncipe",
    c:"239-ST-0",b:"239",f:"ST"},{name:"Saudi Arabia",c:"966-SA-0",b:"966",f:"SA"},{name:"Senegal",c:"221-SN-0",b:"221",f:"SN"},{name:"Serbia",c:"381-RS-0",b:"381",f:"RS"},{name:"Seychelles",c:"248-SC-0",b:"248",f:"SC"},{name:"Sierra Leone",c:"232-SL-0",b:"232",f:"SL"},{name:"Singapore",c:"65-SG-0",b:"65",f:"SG"},{name:"Sint Maarten",c:"1-SX-0",b:"1",f:"SX"},{name:"Slovakia",c:"421-SK-0",b:"421",f:"SK"},{name:"Slovenia",c:"386-SI-0",b:"386",f:"SI"},{name:"Solomon Islands",c:"677-SB-0",b:"677",f:"SB"},
    {name:"Somalia",c:"252-SO-0",b:"252",f:"SO"},{name:"South Africa",c:"27-ZA-0",b:"27",f:"ZA"},{name:"South Georgia and the South Sandwich Islands",c:"500-GS-0",b:"500",f:"GS"},{name:"South Korea",c:"82-KR-0",b:"82",f:"KR"},{name:"South Sudan",c:"211-SS-0",b:"211",f:"SS"},{name:"Spain",c:"34-ES-0",b:"34",f:"ES"},{name:"Sri Lanka",c:"94-LK-0",b:"94",f:"LK"},{name:"Sudan",c:"249-SD-0",b:"249",f:"SD"},{name:"Suriname",c:"597-SR-0",b:"597",f:"SR"},{name:"Svalbard and Jan Mayen",c:"47-SJ-0",b:"47",f:"SJ"},
    {name:"Swaziland",c:"268-SZ-0",b:"268",f:"SZ"},{name:"Sweden",c:"46-SE-0",b:"46",f:"SE"},{name:"Switzerland",c:"41-CH-0",b:"41",f:"CH"},{name:"Syria",c:"963-SY-0",b:"963",f:"SY"},{name:"Taiwan",c:"886-TW-0",b:"886",f:"TW"},{name:"Tajikistan",c:"992-TJ-0",b:"992",f:"TJ"},{name:"Tanzania",c:"255-TZ-0",b:"255",f:"TZ"},{name:"Thailand",c:"66-TH-0",b:"66",f:"TH"},{name:"Togo",c:"228-TG-0",b:"228",f:"TG"},{name:"Tokelau",c:"690-TK-0",b:"690",f:"TK"},{name:"Tonga",c:"676-TO-0",b:"676",f:"TO"},{name:"Trinidad/Tobago",
    c:"1-TT-0",b:"1",f:"TT"},{name:"Tunisia",c:"216-TN-0",b:"216",f:"TN"},{name:"Turkey",c:"90-TR-0",b:"90",f:"TR"},{name:"Turkmenistan",c:"993-TM-0",b:"993",f:"TM"},{name:"Turks and Caicos Islands",c:"1-TC-0",b:"1",f:"TC"},{name:"Tuvalu",c:"688-TV-0",b:"688",f:"TV"},{name:"U.S. Virgin Islands",c:"1-VI-0",b:"1",f:"VI"},{name:"Uganda",c:"256-UG-0",b:"256",f:"UG"},{name:"Ukraine",c:"380-UA-0",b:"380",f:"UA"},{name:"United Arab Emirates",c:"971-AE-0",b:"971",f:"AE"},{name:"United Kingdom",c:"44-GB-0",b:"44",
    f:"GB"},{name:"United States",c:"1-US-0",b:"1",f:"US"},{name:"Uruguay",c:"598-UY-0",b:"598",f:"UY"},{name:"Uzbekistan",c:"998-UZ-0",b:"998",f:"UZ"},{name:"Vanuatu",c:"678-VU-0",b:"678",f:"VU"},{name:"Vatican City",c:"379-VA-0",b:"379",f:"VA"},{name:"Venezuela",c:"58-VE-0",b:"58",f:"VE"},{name:"Vietnam",c:"84-VN-0",b:"84",f:"VN"},{name:"Wallis and Futuna",c:"681-WF-0",b:"681",f:"WF"},{name:"Western Sahara",c:"212-EH-0",b:"212",f:"EH"},{name:"Yemen",c:"967-YE-0",b:"967",f:"YE"},{name:"Zambia",c:"260-ZM-0",
    b:"260",f:"ZM"},{name:"Zimbabwe",c:"263-ZW-0",b:"263",f:"ZW"}];Uh(Rh);var Vh=new Oh(Rh);function Wh(a,b){this.a=a;this.Aa=b;}function Xh(a){a=Va(a);var b=Ph(Vh,a);return 0<b.length?new Wh("1"==b[0].b?"1-US-0":b[0].c,Va(a.substr(b[0].b.length+1))):null}function Yh(a){var b=Qh(a.a);if(!b)throw Error("Country ID "+a.a+" not found.");return "+"+b.b+a.Aa}function Zh(a,b){for(var c=0;c<a.length;c++)if(!Ma($h,a[c])&&(null!==ai&&a[c]in ai||Ma(b,a[c])))return a[c];return null}var $h=["emailLink","password",
    "phone"],ai={"facebook.com":"FacebookAuthProvider","github.com":"GithubAuthProvider","google.com":"GoogleAuthProvider",password:"EmailAuthProvider","twitter.com":"TwitterAuthProvider",phone:"PhoneAuthProvider"};function bi(){this.a=new Hh;I(this.a,"acUiConfig");I(this.a,"autoUpgradeAnonymousUsers");I(this.a,"callbacks");I(this.a,"credentialHelper",ci);I(this.a,"immediateFederatedRedirect",!1);I(this.a,"popupMode",!1);I(this.a,"privacyPolicyUrl");I(this.a,"queryParameterForSignInSuccessUrl","signInSuccessUrl");
    I(this.a,"queryParameterForWidgetMode","mode");I(this.a,"signInFlow");I(this.a,"signInOptions");I(this.a,"signInSuccessUrl");I(this.a,"siteName");I(this.a,"tosUrl");I(this.a,"widgetUrl");}function di(a){var b=!!a.a.get("autoUpgradeAnonymousUsers");b&&!ei(a)&&og('Missing "signInFailure" callback: "signInFailure" callback needs to be provided when "autoUpgradeAnonymousUsers" is set to true.',void 0);return b}function fi(a){a=a.a.get("signInOptions")||[];for(var b=[],c=0;c<a.length;c++){var d=a[c];d=
    ta(d)?d:{provider:d};d.provider&&b.push(d);}return b}function gi(a,b){a=fi(a);for(var c=0;c<a.length;c++)if(a[c].provider===b)return a[c];return null}function hi(a){return Ka(fi(a),function(b){return b.provider})}function ii(a,b){a=ji(a);for(var c=0;c<a.length;c++)if(a[c].providerId===b)return a[c];return null}function ji(a){return Ka(fi(a),function(b){if(ai[b.provider]||Ma(ki,b.provider)){b={providerId:b.provider,S:b.providerName||null,V:b.fullLabel||null,ta:b.buttonColor||null,za:b.iconUrl?Ac(Cc(b.iconUrl)).toString():
    null};for(var c in b)null===b[c]&&delete b[c];return b}return {providerId:b.provider,S:b.providerName||null,V:b.fullLabel||null,ta:b.buttonColor||null,za:b.iconUrl?Ac(Cc(b.iconUrl)).toString():null,Mb:b.loginHintKey||null}})}function li(a){var b=gi(a,index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID);return b&&b.clientId&&mi(a)===ni?b.clientId||null:null}function oi(a){var b=null;Ha(fi(a),function(d){d.provider==index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID&&ta(d.recaptchaParameters)&&!Array.isArray(d.recaptchaParameters)&&
    (b=fb(d.recaptchaParameters));});if(b){var c=[];Ha(pi,function(d){"undefined"!==typeof b[d]&&(c.push(d),delete b[d]);});c.length&&tg('The following provided "recaptchaParameters" keys are not allowed: '+c.join(", "));}return b}function qi(a,b){a=(a=gi(a,b))&&a.scopes;return Array.isArray(a)?a:[]}function ri(a,b){a=(a=gi(a,b))&&a.customParameters;return ta(a)?(a=fb(a),b===index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID&&delete a.login_hint,b===index_cjs$3.auth.GithubAuthProvider.PROVIDER_ID&&delete a.login,
    a):null}function si(a){a=gi(a,index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID);var b=null;a&&"string"===typeof a.loginHint&&(b=Xh(a.loginHint));return a&&a.defaultNationalNumber||b&&b.Aa||null}function ti(a){var b=(a=gi(a,index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID))&&a.defaultCountry||null;b=b&&Sh(b);var c=null;a&&"string"===typeof a.loginHint&&(c=Xh(a.loginHint));return b&&b[0]||c&&Qh(c.a)||null}function ui(a){a=gi(a,index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID);if(!a)return null;var b=a.whitelistedCountries,
    c=a.blacklistedCountries;if("undefined"!==typeof b&&(!Array.isArray(b)||0==b.length))throw Error("WhitelistedCountries must be a non-empty array.");if("undefined"!==typeof c&&!Array.isArray(c))throw Error("BlacklistedCountries must be an array.");if(b&&c)throw Error("Both whitelistedCountries and blacklistedCountries are provided.");if(!b&&!c)return Rh;a=[];if(b){c={};for(var d=0;d<b.length;d++){var e=Th(b[d]);for(var f=0;f<e.length;f++)c[e[f].c]=e[f];}for(var g in c)c.hasOwnProperty(g)&&a.push(c[g]);}else {g=
    {};for(b=0;b<c.length;b++)for(e=Th(c[b]),d=0;d<e.length;d++)g[e[d].c]=e[d];for(e=0;e<Rh.length;e++)null!==g&&Rh[e].c in g||a.push(Rh[e]);}return a}function vi(a){return Jh(a.a,"queryParameterForWidgetMode")}function J(a){var b=a.a.get("tosUrl")||null;a=a.a.get("privacyPolicyUrl")||null;b&&!a&&tg("Privacy Policy URL is missing, the link will not be displayed.");if(b&&a){if("function"===typeof b)return b;if("string"===typeof b)return function(){rf(b);}}return null}function wi(a){var b=a.a.get("tosUrl")||
    null,c=a.a.get("privacyPolicyUrl")||null;c&&!b&&tg("Term of Service URL is missing, the link will not be displayed.");if(b&&c){if("function"===typeof c)return c;if("string"===typeof c)return function(){rf(c);}}return null}function xi(a){return (a=gi(a,index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID))&&"undefined"!==typeof a.requireDisplayName?!!a.requireDisplayName:!0}function yi(a){a=gi(a,index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID);return !(!a||a.signInMethod!==index_cjs$3.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD)}
    function zi(a){a=gi(a,index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID);return !(!a||!a.forceSameDevice)}function Ai(a){if(yi(a)){var b={url:tf(),handleCodeInApp:!0};(a=gi(a,index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID))&&"function"===typeof a.emailLinkSignIn&&hb(b,a.emailLinkSignIn());a=b.url;var c=tf();c instanceof wb||(c=Kb(c));a instanceof wb||(a=Kb(a));var d=c;c=new wb(d);var e=!!a.j;e?xb(c,a.j):e=!!a.A;e?c.A=a.A:e=!!a.h;e?c.h=a.h:e=null!=a.C;var f=a.g;if(e)yb(c,a.C);else if(e=!!a.g)if("/"!=f.charAt(0)&&
    (d.h&&!d.g?f="/"+f:(d=c.g.lastIndexOf("/"),-1!=d&&(f=c.g.substr(0,d+1)+f))),".."==f||"."==f)f="";else if(-1!=f.indexOf("./")||-1!=f.indexOf("/.")){d=0==f.lastIndexOf("/",0);f=f.split("/");for(var g=[],h=0;h<f.length;){var k=f[h++];"."==k?d&&h==f.length&&g.push(""):".."==k?((1<g.length||1==g.length&&""!=g[0])&&g.pop(),d&&h==f.length&&g.push("")):(g.push(k),d=!0);}f=g.join("/");}e?c.g=f:e=""!==a.a.toString();e?zb(c,Ab(a.a)):e=!!a.s;e&&(c.s=a.s);b.url=c.toString();return b}return null}function Bi(a){var b=
    !!a.a.get("immediateFederatedRedirect"),c=hi(a);a=Ci(a);return b&&1==c.length&&!Ma($h,c[0])&&a==Di}function Ci(a){a=a.a.get("signInFlow");for(var b in Ei)if(Ei[b]==a)return Ei[b];return Di}function Fi(a){return Gi(a).signInSuccess||null}function Hi(a){return Gi(a).signInSuccessWithAuthResult||null}function ei(a){return Gi(a).signInFailure||null}function Gi(a){return a.a.get("callbacks")||{}}function mi(a){if("http:"!==(window.location&&window.location.protocol)&&"https:"!==(window.location&&window.location.protocol))return ci;
    a=a.a.get("credentialHelper");if(a===Ii)return ci;for(var b in Ji)if(Ji[b]===a)return Ji[b];return ci}var Ii="accountchooser.com",ni="googleyolo",ci="none",Ji={ic:Ii,lc:ni,NONE:ci},Di="redirect",Ei={oc:"popup",pc:Di},Ki={kc:"callback",RECOVER_EMAIL:"recoverEmail",qc:"resetPassword",REVERT_SECOND_FACTOR_ADDITION:"revertSecondFactorAddition",rc:"select",sc:"signIn",VERIFY_AND_CHANGE_EMAIL:"verifyAndChangeEmail",VERIFY_EMAIL:"verifyEmail"},ki=["anonymous"],pi=["sitekey","tabindex","callback","expired-callback"];
    var Li,Mi,Ni,Oi,K={};function L(a,b,c,d){K[a].apply(null,Array.prototype.slice.call(arguments,1));}function Pi(a){if(a.classList)return a.classList;a=a.className;return q(a)&&a.match(/\S+/g)||[]}function Qi(a,b){return a.classList?a.classList.contains(b):Ma(Pi(a),b)}function Ri(a,b){a.classList?a.classList.add(b):Qi(a,b)||(a.className+=0<a.className.length?" "+b:b);}function Si(a,b){a.classList?a.classList.remove(b):Qi(a,b)&&(a.className=Ja(Pi(a),function(c){return c!=b}).join(" "));}function Ti(a){var b=
    a.type;switch(q(b)&&b.toLowerCase()){case "checkbox":case "radio":return a.checked?a.value:null;case "select-one":return b=a.selectedIndex,0<=b?a.options[b].value:null;case "select-multiple":b=[];for(var c,d=0;c=a.options[d];d++)c.selected&&b.push(c.value);return b.length?b:null;default:return null!=a.value?a.value:null}}function Ui(a,b){var c=a.type;switch(q(c)&&c.toLowerCase()){case "checkbox":case "radio":a.checked=b;break;case "select-one":a.selectedIndex=-1;if(q(b))for(var d=0;c=a.options[d];d++)if(c.value==
    b){c.selected=!0;break}break;case "select-multiple":q(b)&&(b=[b]);for(d=0;c=a.options[d];d++)if(c.selected=!1,b)for(var e,f=0;e=b[f];f++)c.value==e&&(c.selected=!0);break;default:a.value=null!=b?b:"";}}function Vi(a){if(a.altKey&&!a.ctrlKey||a.metaKey||112<=a.keyCode&&123>=a.keyCode)return !1;if(Wi(a.keyCode))return !0;switch(a.keyCode){case 18:case 20:case 93:case 17:case 40:case 35:case 27:case 36:case 45:case 37:case 224:case 91:case 144:case 12:case 34:case 33:case 19:case 255:case 44:case 39:case 145:case 16:case 38:case 252:case 224:case 92:return !1;
    case 0:return !ec;default:return 166>a.keyCode||183<a.keyCode}}function Xi(a,b,c,d,e,f){if(fc&&!nc("525"))return !0;if(hc&&e)return Wi(a);if(e&&!d)return !1;if(!ec){"number"==typeof b&&(b=Yi(b));var g=17==b||18==b||hc&&91==b;if((!c||hc)&&g||hc&&16==b&&(d||f))return !1}if((fc||cc)&&d&&c)switch(a){case 220:case 219:case 221:case 192:case 186:case 189:case 187:case 188:case 190:case 191:case 192:case 222:return !1}if(z&&d&&b==a)return !1;switch(a){case 13:return ec?f||e?!1:!(c&&d):!0;case 27:return !(fc||cc||
    ec)}return ec&&(d||e||f)?!1:Wi(a)}function Wi(a){if(48<=a&&57>=a||96<=a&&106>=a||65<=a&&90>=a||(fc||cc)&&0==a)return !0;switch(a){case 32:case 43:case 63:case 64:case 107:case 109:case 110:case 111:case 186:case 59:case 189:case 187:case 61:case 188:case 190:case 191:case 192:case 222:case 219:case 220:case 221:case 163:return !0;case 173:return ec;default:return !1}}function Yi(a){if(ec)a=Zi(a);else if(hc&&fc)switch(a){case 93:a=91;}return a}function Zi(a){switch(a){case 61:return 187;case 59:return 186;
    case 173:return 189;case 224:return 91;case 0:return 224;default:return a}}function $i(a){E.call(this);this.a=a;le(a,"keydown",this.g,!1,this);le(a,"click",this.h,!1,this);}w($i,E);$i.prototype.g=function(a){(13==a.keyCode||fc&&3==a.keyCode)&&aj(this,a);};$i.prototype.h=function(a){aj(this,a);};function aj(a,b){var c=new bj(b);if(ye(a,c)){c=new cj(b);try{ye(a,c);}finally{b.stopPropagation();}}}$i.prototype.m=function(){$i.K.m.call(this);te(this.a,"keydown",this.g,!1,this);te(this.a,"click",this.h,!1,this);
    delete this.a;};function cj(a){$d.call(this,a.a);this.type="action";}w(cj,$d);function bj(a){$d.call(this,a.a);this.type="beforeaction";}w(bj,$d);function dj(a){E.call(this);this.a=a;a=z?"focusout":"blur";this.g=le(this.a,z?"focusin":"focus",this,!z);this.h=le(this.a,a,this,!z);}w(dj,E);dj.prototype.handleEvent=function(a){var b=new $d(a.a);b.type="focusin"==a.type||"focus"==a.type?"focusin":"focusout";ye(this,b);};dj.prototype.m=function(){dj.K.m.call(this);ue(this.g);ue(this.h);delete this.a;};function ej(a,
    b){E.call(this);this.g=a||1;this.a=b||n;this.h=t(this.ec,this);this.j=Aa();}w(ej,E);l=ej.prototype;l.Ka=!1;l.aa=null;l.ec=function(){if(this.Ka){var a=Aa()-this.j;0<a&&a<.8*this.g?this.aa=this.a.setTimeout(this.h,this.g-a):(this.aa&&(this.a.clearTimeout(this.aa),this.aa=null),ye(this,"tick"),this.Ka&&(fj(this),this.start()));}};l.start=function(){this.Ka=!0;this.aa||(this.aa=this.a.setTimeout(this.h,this.g),this.j=Aa());};function fj(a){a.Ka=!1;a.aa&&(a.a.clearTimeout(a.aa),a.aa=null);}l.m=function(){ej.K.m.call(this);
    fj(this);delete this.a;};function gj(a,b){if(sa(a))b&&(a=t(a,b));else if(a&&"function"==typeof a.handleEvent)a=t(a.handleEvent,a);else throw Error("Invalid listener argument");return 2147483647<Number(0)?-1:n.setTimeout(a,0)}function hj(a){Qd.call(this);this.g=a;this.a={};}w(hj,Qd);var ij=[];function jj(a,b,c,d){qa(c)||(c&&(ij[0]=c.toString()),c=ij);for(var e=0;e<c.length;e++){var f=le(b,c[e],d||a.handleEvent,!1,a.g||a);if(!f)break;a.a[f.key]=f;}}function kj(a){eb(a.a,function(b,c){this.a.hasOwnProperty(c)&&
    ue(b);},a);a.a={};}hj.prototype.m=function(){hj.K.m.call(this);kj(this);};hj.prototype.handleEvent=function(){throw Error("EventHandler.handleEvent not implemented");};function lj(a){E.call(this);this.a=null;this.g=a;a=z||cc||fc&&!nc("531")&&"TEXTAREA"==a.tagName;this.h=new hj(this);jj(this.h,this.g,a?["keydown","paste","cut","drop","input"]:"input",this);}w(lj,E);lj.prototype.handleEvent=function(a){if("input"==a.type)z&&nc(10)&&0==a.keyCode&&0==a.j||(mj(this),ye(this,nj(a)));else if("keydown"!=a.type||
    Vi(a)){var b="keydown"==a.type?this.g.value:null;z&&229==a.keyCode&&(b=null);var c=nj(a);mj(this);this.a=gj(function(){this.a=null;this.g.value!=b&&ye(this,c);},this);}};function mj(a){null!=a.a&&(n.clearTimeout(a.a),a.a=null);}function nj(a){a=new $d(a.a);a.type="input";return a}lj.prototype.m=function(){lj.K.m.call(this);this.h.o();mj(this);delete this.g;};function oj(a,b){E.call(this);a&&(this.Oa&&pj(this),this.qa=a,this.Na=le(this.qa,"keypress",this,b),this.Ya=le(this.qa,"keydown",this.Hb,b,this),
    this.Oa=le(this.qa,"keyup",this.Ib,b,this));}w(oj,E);l=oj.prototype;l.qa=null;l.Na=null;l.Ya=null;l.Oa=null;l.R=-1;l.X=-1;l.Ua=!1;var qj={3:13,12:144,63232:38,63233:40,63234:37,63235:39,63236:112,63237:113,63238:114,63239:115,63240:116,63241:117,63242:118,63243:119,63244:120,63245:121,63246:122,63247:123,63248:44,63272:46,63273:36,63275:35,63276:33,63277:34,63289:144,63302:45},rj={Up:38,Down:40,Left:37,Right:39,Enter:13,F1:112,F2:113,F3:114,F4:115,F5:116,F6:117,F7:118,F8:119,F9:120,F10:121,F11:122,
    F12:123,"U+007F":46,Home:36,End:35,PageUp:33,PageDown:34,Insert:45},sj=!fc||nc("525"),tj=hc&&ec;l=oj.prototype;l.Hb=function(a){if(fc||cc)if(17==this.R&&!a.ctrlKey||18==this.R&&!a.altKey||hc&&91==this.R&&!a.metaKey)this.X=this.R=-1;-1==this.R&&(a.ctrlKey&&17!=a.keyCode?this.R=17:a.altKey&&18!=a.keyCode?this.R=18:a.metaKey&&91!=a.keyCode&&(this.R=91));sj&&!Xi(a.keyCode,this.R,a.shiftKey,a.ctrlKey,a.altKey,a.metaKey)?this.handleEvent(a):(this.X=Yi(a.keyCode),tj&&(this.Ua=a.altKey));};l.Ib=function(a){this.X=
    this.R=-1;this.Ua=a.altKey;};l.handleEvent=function(a){var b=a.a,c=b.altKey;if(z&&"keypress"==a.type){var d=this.X;var e=13!=d&&27!=d?b.keyCode:0;}else (fc||cc)&&"keypress"==a.type?(d=this.X,e=0<=b.charCode&&63232>b.charCode&&Wi(d)?b.charCode:0):bc&&!fc?(d=this.X,e=Wi(d)?b.keyCode:0):("keypress"==a.type?(tj&&(c=this.Ua),b.keyCode==b.charCode?32>b.keyCode?(d=b.keyCode,e=0):(d=this.X,e=b.charCode):(d=b.keyCode||this.X,e=b.charCode||0)):(d=b.keyCode||this.X,e=b.charCode||0),hc&&63==e&&224==d&&(d=191));
    var f=d=Yi(d);d?63232<=d&&d in qj?f=qj[d]:25==d&&a.shiftKey&&(f=9):b.keyIdentifier&&b.keyIdentifier in rj&&(f=rj[b.keyIdentifier]);ec&&sj&&"keypress"==a.type&&!Xi(f,this.R,a.shiftKey,a.ctrlKey,c,a.metaKey)||(a=f==this.R,this.R=f,b=new uj(f,e,a,b),b.altKey=c,ye(this,b));};l.N=function(){return this.qa};function pj(a){a.Na&&(ue(a.Na),ue(a.Ya),ue(a.Oa),a.Na=null,a.Ya=null,a.Oa=null);a.qa=null;a.R=-1;a.X=-1;}l.m=function(){oj.K.m.call(this);pj(this);};function uj(a,b,c,d){$d.call(this,d);this.type="key";
    this.keyCode=a;this.j=b;this.repeat=c;}w(uj,$d);function vj(a,b,c,d){this.top=a;this.right=b;this.bottom=c;this.left=d;}vj.prototype.toString=function(){return "("+this.top+"t, "+this.right+"r, "+this.bottom+"b, "+this.left+"l)"};vj.prototype.ceil=function(){this.top=Math.ceil(this.top);this.right=Math.ceil(this.right);this.bottom=Math.ceil(this.bottom);this.left=Math.ceil(this.left);return this};vj.prototype.floor=function(){this.top=Math.floor(this.top);this.right=Math.floor(this.right);this.bottom=
    Math.floor(this.bottom);this.left=Math.floor(this.left);return this};vj.prototype.round=function(){this.top=Math.round(this.top);this.right=Math.round(this.right);this.bottom=Math.round(this.bottom);this.left=Math.round(this.left);return this};function wj(a,b){var c=Tc(a);return c.defaultView&&c.defaultView.getComputedStyle&&(a=c.defaultView.getComputedStyle(a,null))?a[b]||a.getPropertyValue(b)||"":""}function xj(a){try{var b=a.getBoundingClientRect();}catch(c){return {left:0,top:0,right:0,bottom:0}}z&&
    a.ownerDocument.body&&(a=a.ownerDocument,b.left-=a.documentElement.clientLeft+a.body.clientLeft,b.top-=a.documentElement.clientTop+a.body.clientTop);return b}function yj(a,b){b=b||Zc(document);var c=b||Zc(document);var d=zj(a),e=zj(c);if(!z||9<=Number(oc)){g=wj(c,"borderLeftWidth");var f=wj(c,"borderRightWidth");h=wj(c,"borderTopWidth");k=wj(c,"borderBottomWidth");f=new vj(parseFloat(h),parseFloat(f),parseFloat(k),parseFloat(g));}else {var g=Aj(c,"borderLeft");f=Aj(c,"borderRight");var h=Aj(c,"borderTop"),
    k=Aj(c,"borderBottom");f=new vj(h,f,k,g);}c==Zc(document)?(g=d.a-c.scrollLeft,d=d.g-c.scrollTop,!z||10<=Number(oc)||(g+=f.left,d+=f.top)):(g=d.a-e.a-f.left,d=d.g-e.g-f.top);e=a.offsetWidth;f=a.offsetHeight;h=fc&&!e&&!f;ka(e)&&!h||!a.getBoundingClientRect?a=new Qc(e,f):(a=xj(a),a=new Qc(a.right-a.left,a.bottom-a.top));e=c.clientHeight-a.height;f=c.scrollLeft;h=c.scrollTop;f+=Math.min(g,Math.max(g-(c.clientWidth-a.width),0));h+=Math.min(d,Math.max(d-e,0));c=new Pc(f,h);b.scrollLeft=c.a;b.scrollTop=c.g;}
    function zj(a){var b=Tc(a),c=new Pc(0,0);var d=b?Tc(b):document;d=!z||9<=Number(oc)||"CSS1Compat"==Rc(d).a.compatMode?d.documentElement:d.body;if(a==d)return c;a=xj(a);d=Rc(b).a;b=Zc(d);d=d.parentWindow||d.defaultView;b=z&&nc("10")&&d.pageYOffset!=b.scrollTop?new Pc(b.scrollLeft,b.scrollTop):new Pc(d.pageXOffset||b.scrollLeft,d.pageYOffset||b.scrollTop);c.a=a.left+b.a;c.g=a.top+b.g;return c}var Bj={thin:2,medium:4,thick:6};function Aj(a,b){if("none"==(a.currentStyle?a.currentStyle[b+"Style"]:null))return 0;
    var c=a.currentStyle?a.currentStyle[b+"Width"]:null;if(c in Bj)a=Bj[c];else if(/^\d+px?$/.test(c))a=parseInt(c,10);else {b=a.style.left;var d=a.runtimeStyle.left;a.runtimeStyle.left=a.currentStyle.left;a.style.left=c;c=a.style.pixelLeft;a.style.left=b;a.runtimeStyle.left=d;a=+c;}return a}function Cj(){}oa(Cj);Cj.prototype.a=0;function Dj(a){E.call(this);this.s=a||Rc();this.cb=null;this.na=!1;this.g=null;this.L=void 0;this.oa=this.Ea=this.Y=null;}w(Dj,E);l=Dj.prototype;l.Jb=Cj.Xa();l.N=function(){return this.g};
    function M(a,b){return a.g?Wc(b,a.g||a.s.a):null}function Ej(a){a.L||(a.L=new hj(a));return a.L}l.Za=function(a){if(this.Y&&this.Y!=a)throw Error("Method not supported");Dj.K.Za.call(this,a);};l.kb=function(){this.g=this.s.a.createElement("DIV");};l.render=function(a){if(this.na)throw Error("Component already rendered");this.g||this.kb();a?a.insertBefore(this.g,null):this.s.a.body.appendChild(this.g);this.Y&&!this.Y.na||this.v();};l.v=function(){this.na=!0;Fj(this,function(a){!a.na&&a.N()&&a.v();});};
    l.ya=function(){Fj(this,function(a){a.na&&a.ya();});this.L&&kj(this.L);this.na=!1;};l.m=function(){this.na&&this.ya();this.L&&(this.L.o(),delete this.L);Fj(this,function(a){a.o();});this.g&&$c(this.g);this.Y=this.g=this.oa=this.Ea=null;Dj.K.m.call(this);};function Fj(a,b){a.Ea&&Ha(a.Ea,b,void 0);}l.removeChild=function(a,b){if(a){var c=q(a)?a:a.cb||(a.cb=":"+(a.Jb.a++).toString(36));this.oa&&c?(a=this.oa,a=(null!==a&&c in a?a[c]:void 0)||null):a=null;if(c&&a){var d=this.oa;c in d&&delete d[c];Na(this.Ea,
    a);b&&(a.ya(),a.g&&$c(a.g));b=a;if(null==b)throw Error("Unable to set parent component");b.Y=null;Dj.K.Za.call(b,null);}}if(!a)throw Error("Child is not in parent component");return a};function N(a,b){var c=bd(a,"firebaseui-textfield");b?(Si(a,"firebaseui-input-invalid"),Ri(a,"firebaseui-input"),c&&Si(c,"firebaseui-textfield-invalid")):(Si(a,"firebaseui-input"),Ri(a,"firebaseui-input-invalid"),c&&Ri(c,"firebaseui-textfield-invalid"));}function Gj(a,b,c){b=new lj(b);Td(a,za(Ud,b));jj(Ej(a),b,"input",
    c);}function Hj(a,b,c){b=new oj(b);Td(a,za(Ud,b));jj(Ej(a),b,"key",function(d){13==d.keyCode&&(d.stopPropagation(),d.preventDefault(),c(d));});}function Ij(a,b,c){b=new dj(b);Td(a,za(Ud,b));jj(Ej(a),b,"focusin",c);}function Jj(a,b,c){b=new dj(b);Td(a,za(Ud,b));jj(Ej(a),b,"focusout",c);}function O(a,b,c){b=new $i(b);Td(a,za(Ud,b));jj(Ej(a),b,"action",function(d){d.stopPropagation();d.preventDefault();c(d);});}function Kj(a){Ri(a,"firebaseui-hidden");}function Lj(a,b){b&&ad(a,b);Si(a,"firebaseui-hidden");}function Mj(a){return !Qi(a,
    "firebaseui-hidden")&&"none"!=a.style.display}function Nj(a){a=a||{};var b=a.email,c=a.disabled,d='<div class="firebaseui-textfield mdl-textfield mdl-js-textfield mdl-textfield--floating-label"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-email-input">';d=a.uc?d+"Enter new email address":d+"Email";d+='</label><input type="email" name="email" id="ui-sign-in-email-input" autocomplete="username" class="mdl-textfield__input firebaseui-input firebaseui-id-email" value="'+vd(null!=
    b?b:"")+'"'+(c?"disabled":"")+'></div><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-id-email-error"></p></div>';return B(d)}function Oj(a){a=a||{};a=a.label;var b='<button type="submit" class="firebaseui-id-submit firebaseui-button mdl-button mdl-js-button mdl-button--raised mdl-button--colored">';b=a?b+A(a):b+"Next";return B(b+"</button>")}function Pj(){var a=""+Oj({label:D("Sign In")});return B(a)}function Qj(){var a=""+
    Oj({label:D("Save")});return B(a)}function Rj(){var a=""+Oj({label:D("Continue")});return B(a)}function Sj(a){a=a||{};a=a.label;var b='<div class="firebaseui-new-password-component"><div class="firebaseui-textfield mdl-textfield mdl-js-textfield mdl-textfield--floating-label"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-new-password-input">';b=a?b+A(a):b+"Choose password";return B(b+'</label><input type="password" name="newPassword" id="ui-sign-in-new-password-input" autocomplete="new-password" class="mdl-textfield__input firebaseui-input firebaseui-id-new-password"></div><a href="javascript:void(0)" class="firebaseui-input-floating-button firebaseui-id-password-toggle firebaseui-input-toggle-on firebaseui-input-toggle-blur"></a><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-id-new-password-error"></p></div></div>')}
    function Tj(){var b='<div class="firebaseui-textfield mdl-textfield mdl-js-textfield mdl-textfield--floating-label"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-password-input">';b=b+"Password";return B(b+'</label><input type="password" name="password" id="ui-sign-in-password-input" autocomplete="current-password" class="mdl-textfield__input firebaseui-input firebaseui-id-password"></div><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-id-password-error"></p></div>')}
    function Uj(){return B('<a class="firebaseui-link firebaseui-id-secondary-link" href="javascript:void(0)">Trouble signing in?</a>')}function Vj(a){a=a||{};a=a.label;var b='<button class="firebaseui-id-secondary-link firebaseui-button mdl-button mdl-js-button mdl-button--primary">';b=a?b+A(a):b+"Cancel";return B(b+"</button>")}function Wj(a){var b="";a.F&&a.D&&(b+='<ul class="firebaseui-tos-list firebaseui-tos"><li class="firebaseui-inline-list-item"><a href="javascript:void(0)" class="firebaseui-link firebaseui-tos-link" target="_blank">Terms of Service</a></li><li class="firebaseui-inline-list-item"><a href="javascript:void(0)" class="firebaseui-link firebaseui-pp-link" target="_blank">Privacy Policy</a></li></ul>');
    return B(b)}function Xj(a){var b="";a.F&&a.D&&(b+='<p class="firebaseui-tos firebaseui-tospp-full-message">By continuing, you are indicating that you accept our <a href="javascript:void(0)" class="firebaseui-link firebaseui-tos-link" target="_blank">Terms of Service</a> and <a href="javascript:void(0)" class="firebaseui-link firebaseui-pp-link" target="_blank">Privacy Policy</a>.</p>');return B(b)}function Yj(a){a='<div class="firebaseui-info-bar firebaseui-id-info-bar"><p class="firebaseui-info-bar-message">'+
    A(a.message)+'&nbsp;&nbsp;<a href="javascript:void(0)" class="firebaseui-link firebaseui-id-dismiss-info-bar">Dismiss</a></p></div>';return B(a)}Yj.a="firebaseui.auth.soy2.element.infoBar";function Zj(a){var b=a.content;a=a.zb;return B('<dialog class="mdl-dialog firebaseui-dialog firebaseui-id-dialog'+(a?" "+vd(a):"")+'">'+A(b)+"</dialog>")}function ak(a){var b=a.message;return B(Zj({content:ud('<div class="firebaseui-dialog-icon-wrapper"><div class="'+vd(a.Ma)+' firebaseui-dialog-icon"></div></div><div class="firebaseui-progress-dialog-message">'+
    A(b)+"</div>")}))}ak.a="firebaseui.auth.soy2.element.progressDialog";function bk(a){var b='<div class="firebaseui-list-box-actions">';a=a.items;for(var c=a.length,d=0;d<c;d++){var e=a[d];b+='<button type="button" data-listboxid="'+vd(e.id)+'" class="mdl-button firebaseui-id-list-box-dialog-button firebaseui-list-box-dialog-button">'+(e.Ma?'<div class="firebaseui-list-box-icon-wrapper"><div class="firebaseui-list-box-icon '+vd(e.Ma)+'"></div></div>':"")+'<div class="firebaseui-list-box-label-wrapper">'+
    A(e.label)+"</div></button>";}b=""+Zj({zb:D("firebaseui-list-box-dialog"),content:ud(b+"</div>")});return B(b)}bk.a="firebaseui.auth.soy2.element.listBoxDialog";function ck(a){a=a||{};return B(a.tb?'<div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active firebaseui-busy-indicator firebaseui-id-busy-indicator"></div>':'<div class="mdl-progress mdl-js-progress mdl-progress__indeterminate firebaseui-busy-indicator firebaseui-id-busy-indicator"></div>')}ck.a="firebaseui.auth.soy2.element.busyIndicator";
    function dk(a,b){a=a||{};a=a.ga;return C(a.S?a.S:b.hb[a.providerId]?""+b.hb[a.providerId]:a.providerId&&0==a.providerId.indexOf("saml.")?a.providerId.substring(5):a.providerId&&0==a.providerId.indexOf("oidc.")?a.providerId.substring(5):""+a.providerId)}function ek(a){fk(a,"upgradeElement");}function gk(a){fk(a,"downgradeElements");}var hk=["mdl-js-textfield","mdl-js-progress","mdl-js-spinner","mdl-js-button"];function fk(a,b){a&&window.componentHandler&&window.componentHandler[b]&&Ha(hk,function(c){if(Qi(a,
    c))window.componentHandler[b](a);Ha(Uc(c,a),function(d){window.componentHandler[b](d);});});}function ik(a,b,c){jk.call(this);document.body.appendChild(a);a.showModal||window.dialogPolyfill.registerDialog(a);a.showModal();ek(a);b&&O(this,a,function(f){var g=a.getBoundingClientRect();(f.clientX<g.left||g.left+g.width<f.clientX||f.clientY<g.top||g.top+g.height<f.clientY)&&jk.call(this);});if(!c){var d=this.N().parentElement||this.N().parentNode;if(d){var e=this;this.da=function(){if(a.open){var f=a.getBoundingClientRect().height,
    g=d.getBoundingClientRect().height,h=d.getBoundingClientRect().top-document.body.getBoundingClientRect().top,k=d.getBoundingClientRect().left-document.body.getBoundingClientRect().left,p=a.getBoundingClientRect().width,r=d.getBoundingClientRect().width;a.style.top=(h+(g-f)/2).toString()+"px";f=k+(r-p)/2;a.style.left=f.toString()+"px";a.style.right=(document.body.getBoundingClientRect().width-f-p).toString()+"px";}else window.removeEventListener("resize",e.da);};this.da();window.addEventListener("resize",
    this.da,!1);}}}function jk(){var a=kk.call(this);a&&(gk(a),a.open&&a.close(),$c(a),this.da&&window.removeEventListener("resize",this.da));}function kk(){return Wc("firebaseui-id-dialog")}function lk(){$c(mk.call(this));}function mk(){return M(this,"firebaseui-id-info-bar")}function nk(){return M(this,"firebaseui-id-dismiss-info-bar")}var ok={xa:{"google.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg","github.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/github.svg",
    "facebook.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/facebook.svg","twitter.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/twitter.svg",password:"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/mail.svg",phone:"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/phone.svg",anonymous:"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/anonymous.png","microsoft.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/microsoft.svg","yahoo.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/yahoo.svg",
    "apple.com":"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/apple.png",saml:"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/saml.svg",oidc:"https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/oidc.svg"},wa:{"google.com":"#ffffff","github.com":"#333333","facebook.com":"#3b5998","twitter.com":"#55acee",password:"#db4437",phone:"#02bd7e",anonymous:"#f4b400","microsoft.com":"#2F2F2F","yahoo.com":"#720E9E","apple.com":"#000000",saml:"#007bff",oidc:"#007bff"},hb:{"google.com":"Google",
    "github.com":"GitHub","facebook.com":"Facebook","twitter.com":"Twitter",password:"Password",phone:"Phone",anonymous:"Guest","microsoft.com":"Microsoft","yahoo.com":"Yahoo","apple.com":"Apple"}};function pk(a,b,c){Zd.call(this,a,b);for(var d in c)this[d]=c[d];}w(pk,Zd);function P(a,b,c,d,e){Dj.call(this,c);this.fb=a;this.eb=b;this.Fa=!1;this.Ga=d||null;this.A=this.ca=null;this.Z=fb(ok);hb(this.Z,e||{});}w(P,Dj);l=P.prototype;l.kb=function(){var a=id(this.fb,this.eb,this.Z,this.s);ek(a);this.g=a;};l.v=
    function(){P.K.v.call(this);Ce(Q(this),new pk("pageEnter",Q(this),{pageId:this.Ga}));if(this.bb()&&this.Z.F){var a=this.Z.F;O(this,this.bb(),function(){a();});}if(this.ab()&&this.Z.D){var b=this.Z.D;O(this,this.ab(),function(){b();});}};l.ya=function(){Ce(Q(this),new pk("pageExit",Q(this),{pageId:this.Ga}));P.K.ya.call(this);};l.m=function(){window.clearTimeout(this.ca);this.eb=this.fb=this.ca=null;this.Fa=!1;this.A=null;gk(this.N());P.K.m.call(this);};function qk(a){a.Fa=!0;var b=Qi(a.N(),"firebaseui-use-spinner");
    a.ca=window.setTimeout(function(){a.N()&&null===a.A&&(a.A=id(ck,{tb:b},null,a.s),a.N().appendChild(a.A),ek(a.A));},500);}l.I=function(a,b,c,d){function e(){if(f.T)return null;f.Fa=!1;window.clearTimeout(f.ca);f.ca=null;f.A&&(gk(f.A),$c(f.A),f.A=null);}var f=this;if(f.Fa)return null;qk(f);return a.apply(null,b).then(c,d).then(e,e)};function Q(a){return a.N().parentElement||a.N().parentNode}function rk(a,b,c){Hj(a,b,function(){c.focus();});}function sk(a,b,c){Hj(a,b,function(){c();});}u(P.prototype,{a:function(a){lk.call(this);
    var b=id(Yj,{message:a},null,this.s);this.N().appendChild(b);O(this,nk.call(this),function(){$c(b);});},wc:lk,yc:mk,xc:nk,$:function(a,b){a=id(ak,{Ma:a,message:b},null,this.s);ik.call(this,a);},h:jk,Bb:kk,Ac:function(){return M(this,"firebaseui-tos")},bb:function(){return M(this,"firebaseui-tos-link")},ab:function(){return M(this,"firebaseui-pp-link")},Bc:function(){return M(this,"firebaseui-tos-list")}});function tk(a,b,c){a=a||{};b=a.Va;var d=a.ia;a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-sign-in"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in with email</h1></div><div class="firebaseui-card-content"><div class="firebaseui-relative-wrapper">'+
    Nj(a)+'</div></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+(b?Vj(null):"")+Oj(null)+'</div></div><div class="firebaseui-card-footer">'+(d?Xj(c):Wj(c))+"</div></form></div>";return B(a)}tk.a="firebaseui.auth.soy2.page.signIn";function uk(a,b,c){a=a||{};b=a.ia;a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-sign-in"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content">'+
    Nj(a)+Tj()+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-links">'+Uj()+'</div><div class="firebaseui-form-actions">'+Pj()+'</div></div><div class="firebaseui-card-footer">'+(b?Xj(c):Wj(c))+"</div></form></div>";return B(a)}uk.a="firebaseui.auth.soy2.page.passwordSignIn";function vk(a,b,c){a=a||{};var d=a.Rb;b=a.Ta;var e=a.ia,f='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-sign-up"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Create account</h1></div><div class="firebaseui-card-content">'+
    Nj(a);d?(a=a||{},a=a.name,a='<div class="firebaseui-textfield mdl-textfield mdl-js-textfield mdl-textfield--floating-label"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-name-input">First &amp; last name</label><input type="text" name="name" id="ui-sign-in-name-input" autocomplete="name" class="mdl-textfield__input firebaseui-input firebaseui-id-name" value="'+vd(null!=a?a:"")+'"></div><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-id-name-error"></p></div>',
    a=B(a)):a="";c=f+a+Sj(null)+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+(b?Vj(null):"")+Qj()+'</div></div><div class="firebaseui-card-footer">'+(e?Xj(c):Wj(c))+"</div></form></div>";return B(c)}vk.a="firebaseui.auth.soy2.page.passwordSignUp";function wk(a,b,c){a=a||{};b=a.Ta;a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-recovery"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Recover password</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Get instructions sent to this email that explain how to reset your password</p>'+
    Nj(a)+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+(b?Vj(null):"")+Oj({label:D("Send")})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(a)}wk.a="firebaseui.auth.soy2.page.passwordRecovery";function xk(a,b,c){b=a.G;var d="";a="Follow the instructions sent to <strong>"+(A(a.email)+"</strong> to recover your password");d+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-recovery-email-sent"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Check your email</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+
    a+'</p></div><div class="firebaseui-card-actions">';b&&(d+='<div class="firebaseui-form-actions">'+Oj({label:D("Done")})+"</div>");d+='</div><div class="firebaseui-card-footer">'+Wj(c)+"</div></div>";return B(d)}xk.a="firebaseui.auth.soy2.page.passwordRecoveryEmailSent";function yk(a,b,c){return B('<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-callback"><div class="firebaseui-callback-indicator-container">'+ck(null)+"</div></div>")}yk.a="firebaseui.auth.soy2.page.callback";
    function zk(a,b,c){return B('<div class="firebaseui-container firebaseui-id-page-spinner">'+ck({tb:!0})+"</div>")}zk.a="firebaseui.auth.soy2.page.spinner";function Ak(){return B('<div class="firebaseui-container firebaseui-id-page-blank firebaseui-use-spinner"></div>')}Ak.a="firebaseui.auth.soy2.page.blank";function Bk(a,b,c){b="";a="A sign-in email with additional instructions was sent to <strong>"+(A(a.email)+"</strong>. Check your email to complete sign-in.");var d=B('<a class="firebaseui-link firebaseui-id-trouble-getting-email-link" href="javascript:void(0)">Trouble getting email?</a>');
    b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-link-sign-in-sent"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign-in email sent</h1></div><div class="firebaseui-card-content"><div class="firebaseui-email-sent"></div><p class="firebaseui-text">'+a+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-links">'+d+'</div><div class="firebaseui-form-actions">'+Vj({label:D("Back")})+'</div></div><div class="firebaseui-card-footer">'+
    Wj(c)+"</div></form></div>";return B(b)}Bk.a="firebaseui.auth.soy2.page.emailLinkSignInSent";function Ck(a,b,c){a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-not-received"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Trouble getting email?</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Try these common fixes:<ul><li>Check if the email was marked as spam or filtered.</li><li>Check your internet connection.</li><li>Check that you did not misspell your email.</li><li>Check that your inbox space is not running out or other inbox settings related issues.</li></ul></p><p class="firebaseui-text">If the steps above didn\'t work, you can resend the email. Note that this will deactivate the link in the older email.</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-links">'+
    B('<a class="firebaseui-link firebaseui-id-resend-email-link" href="javascript:void(0)">Resend</a>')+'</div><div class="firebaseui-form-actions">'+Vj({label:D("Back")})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(a)}Ck.a="firebaseui.auth.soy2.page.emailNotReceived";function Dk(a,b,c){a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-link-sign-in-confirmation"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Confirm email</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Confirm your email to complete sign in</p><div class="firebaseui-relative-wrapper">'+
    Nj(a)+'</div></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Vj(null)+Oj(null)+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(a)}Dk.a="firebaseui.auth.soy2.page.emailLinkSignInConfirmation";function Ek(){var a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-different-device-error"><div class="firebaseui-card-header"><h1 class="firebaseui-title">New device or browser detected</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Try opening the link using the same device or browser where you started the sign-in process.</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+
    Vj({label:D("Dismiss")})+"</div></div></div>";return B(a)}Ek.a="firebaseui.auth.soy2.page.differentDeviceError";function Fk(){var a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-anonymous-user-mismatch"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Session ended</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">The session associated with this sign-in request has either expired or was cleared.</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+
    Vj({label:D("Dismiss")})+"</div></div></div>";return B(a)}Fk.a="firebaseui.auth.soy2.page.anonymousUserMismatch";function Gk(a,b,c){b="";a="You\u2019ve already used <strong>"+(A(a.email)+"</strong> to sign in. Enter your password for that account.");b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-linking"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><h2 class="firebaseui-subtitle">You already have an account</h2><p class="firebaseui-text">'+
    a+"</p>"+Tj()+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-links">'+Uj()+'</div><div class="firebaseui-form-actions">'+Pj()+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Gk.a="firebaseui.auth.soy2.page.passwordLinking";function Hk(a,b,c){var d=a.email;b="";a=""+dk(a,c);a=D(a);d="You\u2019ve already used <strong>"+(A(d)+("</strong>. You can connect your <strong>"+(A(a)+("</strong> account with <strong>"+(A(d)+"</strong> by signing in with email link below.")))));
    a="For this flow to successfully connect your "+(A(a)+" account with this email, you have to open the link on the same device or browser.");b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-link-sign-in-linking"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><h2 class="firebaseui-subtitle">You already have an account</h2><p class="firebaseui-text firebaseui-text-justify">'+
    d+'<p class="firebaseui-text firebaseui-text-justify">'+a+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Pj()+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Hk.a="firebaseui.auth.soy2.page.emailLinkSignInLinking";function Ik(a,b,c){b="";var d=""+dk(a,c);d=D(d);a="You originally intended to connect <strong>"+(A(d)+"</strong> to your email account but have opened the link on a different device where you are not signed in.");
    d="If you still want to connect your <strong>"+(A(d)+"</strong> account, open the link on the same device where you started sign-in. Otherwise, tap Continue to sign-in on this device.");b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-link-sign-in-linking-different-device"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text firebaseui-text-justify">'+
    a+'</p><p class="firebaseui-text firebaseui-text-justify">'+d+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Rj()+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Ik.a="firebaseui.auth.soy2.page.emailLinkSignInLinkingDifferentDevice";function Jk(a,b,c){var d=a.email;b="";a=""+dk(a,c);a=D(a);d="You\u2019ve already used <strong>"+(A(d)+("</strong>. Sign in with "+(A(a)+" to continue.")));b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-federated-linking"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><h2 class="firebaseui-subtitle">You already have an account</h2><p class="firebaseui-text">'+
    d+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Oj({label:D("Sign in with "+a)})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Jk.a="firebaseui.auth.soy2.page.federatedLinking";function Kk(a,b,c){b="";a="To continue sign in with <strong>"+(A(a.email)+"</strong> on this device, you have to recover the password.");b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-unsupported-provider"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+
    a+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Vj(null)+Oj({label:D("Recover password")})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Kk.a="firebaseui.auth.soy2.page.unsupportedProvider";function Lk(a){var b="",c='<p class="firebaseui-text">for <strong>'+(A(a.email)+"</strong></p>");b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-reset"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Reset your password</h1></div><div class="firebaseui-card-content">'+
    c+Sj(td(a))+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Qj()+"</div></div></form></div>";return B(b)}Lk.a="firebaseui.auth.soy2.page.passwordReset";function Mk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-reset-success"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Password changed</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">You can now sign in with your new password</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Mk.a="firebaseui.auth.soy2.page.passwordResetSuccess";function Nk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-password-reset-failure"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Try resetting your password again</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Your request to reset your password has expired or the link has already been used</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Nk.a="firebaseui.auth.soy2.page.passwordResetFailure";function Ok(a){var b=a.G,c="";a="Your sign-in email address has been changed back to <strong>"+(A(a.email)+"</strong>.");c+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-change-revoke-success"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Updated email address</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+
    a+'</p><p class="firebaseui-text">If you didn\u2019t ask to change your sign-in email, it\u2019s possible someone is trying to access your account and you should <a class="firebaseui-link firebaseui-id-reset-password-link" href="javascript:void(0)">change your password right away</a>.</p></div><div class="firebaseui-card-actions">'+(b?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></form></div>";return B(c)}Ok.a="firebaseui.auth.soy2.page.emailChangeRevokeSuccess";function Pk(a){a=
    a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-change-revoke-failure"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Unable to update your email address</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">There was a problem changing your sign-in email back.</p><p class="firebaseui-text">If you try again and still can\u2019t reset your email, try asking your administrator for help.</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Pk.a="firebaseui.auth.soy2.page.emailChangeRevokeFailure";function Qk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-verification-success"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Your email has been verified</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">You can now sign in with your new account</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Qk.a="firebaseui.auth.soy2.page.emailVerificationSuccess";function Rk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-verification-failure"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Try verifying your email again</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Your request to verify your email has expired or the link has already been used</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Rk.a="firebaseui.auth.soy2.page.emailVerificationFailure";function Sk(a){var b=a.G,c="";a="You can now sign in with your new email <strong>"+(A(a.email)+"</strong>.");c+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-verify-and-change-email-success"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Your email has been verified and changed</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+
    a+'</p></div><div class="firebaseui-card-actions">'+(b?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(c)}Sk.a="firebaseui.auth.soy2.page.verifyAndChangeEmailSuccess";function Tk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-verify-and-change-email-failure"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Try updating your email again</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Your request to verify and update your email has expired or the link has already been used.</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Tk.a="firebaseui.auth.soy2.page.verifyAndChangeEmailFailure";function Uk(a){var b=a.factorId,c=a.phoneNumber;a=a.G;var d='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-revert-second-factor-addition-success"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Removed second factor</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">';
    switch(b){case "phone":b="The <strong>"+(A(b)+(" "+(A(c)+"</strong> was removed as a second authentication step.")));d+=b;break;default:d+="The device or app was removed as a second authentication step.";}d+='</p><p class="firebaseui-text">If you don\'t recognize this device, someone might be trying to access your account. Consider <a class="firebaseui-link firebaseui-id-reset-password-link" href="javascript:void(0)">changing your password right away</a>.</p></div><div class="firebaseui-card-actions">'+
    (a?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></form></div>";return B(d)}Uk.a="firebaseui.auth.soy2.page.revertSecondFactorAdditionSuccess";function Wk(a){a=a||{};a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-revert-second-factor-addition-failure"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Couldn\'t remove your second factor</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">Something went wrong removing your second factor.</p><p class="firebaseui-text">Try removing it again. If that doesn\'t work, contact support for assistance.</p></div><div class="firebaseui-card-actions">'+
    (a.G?'<div class="firebaseui-form-actions">'+Rj()+"</div>":"")+"</div></div>";return B(a)}Wk.a="firebaseui.auth.soy2.page.revertSecondFactorAdditionFailure";function Xk(a){var b=a.yb;a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-recoverable-error"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Error encountered</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+A(a.errorMessage)+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">';
    b&&(a+=Oj({label:D("Retry")}));return B(a+"</div></div></div>")}Xk.a="firebaseui.auth.soy2.page.recoverableError";function Yk(a){a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-unrecoverable-error"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Error encountered</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+A(a.errorMessage)+"</p></div></div>";return B(a)}Yk.a="firebaseui.auth.soy2.page.unrecoverableError";function Zk(a,
    b,c){var d=a.Ob;b="";a="Continue with "+(A(a.hc)+"?");d="You originally wanted to sign in with "+A(d);b+='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-email-mismatch"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><h2 class="firebaseui-subtitle">'+a+'</h2><p class="firebaseui-text">'+d+'</p></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+
    Vj(null)+Oj({label:D("Continue")})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form></div>";return B(b)}Zk.a="firebaseui.auth.soy2.page.emailMismatch";function $k(a,b,c){var d='<div class="firebaseui-container firebaseui-page-provider-sign-in firebaseui-id-page-provider-sign-in firebaseui-use-spinner"><div class="firebaseui-card-content"><form onsubmit="return false;"><ul class="firebaseui-idp-list">';a=a.Qb;b=a.length;for(var e=0;e<b;e++){var f={ga:a[e]},g=c;f=f||{};var h=f.ga;
    var k=f;k=k||{};var p="";switch(k.ga.providerId){case "google.com":p+="firebaseui-idp-google";break;case "github.com":p+="firebaseui-idp-github";break;case "facebook.com":p+="firebaseui-idp-facebook";break;case "twitter.com":p+="firebaseui-idp-twitter";break;case "phone":p+="firebaseui-idp-phone";break;case "anonymous":p+="firebaseui-idp-anonymous";break;case "password":p+="firebaseui-idp-password";break;default:p+="firebaseui-idp-generic";}k='<button class="firebaseui-idp-button mdl-button mdl-js-button mdl-button--raised '+
    vd(C(p))+' firebaseui-id-idp-button" data-provider-id="'+vd(h.providerId)+'" style="background-color:';p=(p=f)||{};p=p.ga;k=k+vd(Ed(C(p.ta?p.ta:g.wa[p.providerId]?""+g.wa[p.providerId]:0==p.providerId.indexOf("saml.")?""+g.wa.saml:0==p.providerId.indexOf("oidc.")?""+g.wa.oidc:""+g.wa.password)))+'"><span class="firebaseui-idp-icon-wrapper"><img class="firebaseui-idp-icon" alt="" src="';var r=f;p=g;r=r||{};r=r.ga;p=sd(r.za?Ad(r.za):p.xa[r.providerId]?Ad(p.xa[r.providerId]):0==r.providerId.indexOf("saml.")?
    Ad(p.xa.saml):0==r.providerId.indexOf("oidc.")?Ad(p.xa.oidc):Ad(p.xa.password));k=k+vd(Ad(p))+'"></span>';"password"==h.providerId?(k+='<span class="firebaseui-idp-text firebaseui-idp-text-long">',h.V?k+=A(h.V):h.S?(f="Sign in with "+A(dk(f,g)),k+=f):k+="Sign in with email",k+='</span><span class="firebaseui-idp-text firebaseui-idp-text-short">',k=h.S?k+A(h.S):k+"Email",k+="</span>"):"phone"==h.providerId?(k+='<span class="firebaseui-idp-text firebaseui-idp-text-long">',h.V?k+=A(h.V):h.S?(f="Sign in with "+
    A(dk(f,g)),k+=f):k+="Sign in with phone",k+='</span><span class="firebaseui-idp-text firebaseui-idp-text-short">',k=h.S?k+A(h.S):k+"Phone",k+="</span>"):"anonymous"==h.providerId?(k+='<span class="firebaseui-idp-text firebaseui-idp-text-long">',h.V?k+=A(h.V):h.S?(f="Sign in with "+A(dk(f,g)),k+=f):k+="Continue as guest",k+='</span><span class="firebaseui-idp-text firebaseui-idp-text-short">',k=h.S?k+A(h.S):k+"Guest",k+="</span>"):(k+='<span class="firebaseui-idp-text firebaseui-idp-text-long">',h.V?
    k+=A(h.V):(p="Sign in with "+A(dk(f,g)),k+=p),k+='</span><span class="firebaseui-idp-text firebaseui-idp-text-short">'+(h.S?A(h.S):A(dk(f,g)))+"</span>");h=B(k+"</button>");d+='<li class="firebaseui-list-item">'+h+"</li>";}d+='</ul></form></div><div class="firebaseui-card-footer firebaseui-provider-sign-in-footer">'+Xj(c)+"</div></div>";return B(d)}$k.a="firebaseui.auth.soy2.page.providerSignIn";function al(a,b,c){a=a||{};var d=a.Eb,e=a.Va;b=a.ia;a=a||{};a=a.Aa;a='<div class="firebaseui-phone-number"><button class="firebaseui-id-country-selector firebaseui-country-selector mdl-button mdl-js-button"><span class="firebaseui-flag firebaseui-country-selector-flag firebaseui-id-country-selector-flag"></span><span class="firebaseui-id-country-selector-code"></span></button><div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label firebaseui-textfield firebaseui-phone-input-wrapper"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-phone-number-input">Phone number</label><input type="tel" name="phoneNumber" id="ui-sign-in-phone-number-input" class="mdl-textfield__input firebaseui-input firebaseui-id-phone-number" value="'+
    vd(null!=a?a:"")+'"></div></div><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-phone-number-error firebaseui-id-phone-number-error"></p></div>';a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-phone-sign-in-start"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Enter your phone number</h1></div><div class="firebaseui-card-content"><div class="firebaseui-relative-wrapper">'+
    B(a);var f;d?f=B('<div class="firebaseui-recaptcha-wrapper"><div class="firebaseui-recaptcha-container"></div><div class="firebaseui-error-wrapper firebaseui-recaptcha-error-wrapper"><p class="firebaseui-error firebaseui-hidden firebaseui-id-recaptcha-error"></p></div></div>'):f="";f=a+f+'</div></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+(e?Vj(null):"")+Oj({label:D("Verify")})+'</div></div><div class="firebaseui-card-footer">';b?(b='<p class="firebaseui-tos firebaseui-phone-tos">',
    b=c.F&&c.D?b+'By tapping Verify, you are indicating that you accept our <a href="javascript:void(0)" class="firebaseui-link firebaseui-tos-link" target="_blank">Terms of Service</a> and <a href="javascript:void(0)" class="firebaseui-link firebaseui-pp-link" target="_blank">Privacy Policy</a>. An SMS may be sent. Message &amp; data rates may apply.':b+"By tapping Verify, an SMS may be sent. Message &amp; data rates may apply.",c=B(b+"</p>")):c=B('<p class="firebaseui-tos firebaseui-phone-sms-notice">By tapping Verify, an SMS may be sent. Message &amp; data rates may apply.</p>')+
    Wj(c);return B(f+c+"</div></form></div>")}al.a="firebaseui.auth.soy2.page.phoneSignInStart";function bl(a,b,c){a=a||{};b=a.phoneNumber;var d="";a='Enter the 6-digit code we sent to <a class="firebaseui-link firebaseui-change-phone-number-link firebaseui-id-change-phone-number-link" href="javascript:void(0)">&lrm;'+(A(b)+"</a>");A(b);b=d;d=B('<div class="firebaseui-textfield mdl-textfield mdl-js-textfield mdl-textfield--floating-label"><label class="mdl-textfield__label firebaseui-label" for="ui-sign-in-phone-confirmation-code-input">6-digit code</label><input type="number" name="phoneConfirmationCode" id="ui-sign-in-phone-confirmation-code-input" class="mdl-textfield__input firebaseui-input firebaseui-id-phone-confirmation-code"></div><div class="firebaseui-error-wrapper"><p class="firebaseui-error firebaseui-text-input-error firebaseui-hidden firebaseui-id-phone-confirmation-code-error"></p></div>');
    c='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-phone-sign-in-finish"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Verify your phone number</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">'+a+"</p>"+d+'</div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Vj(null)+Oj({label:D("Continue")})+'</div></div><div class="firebaseui-card-footer">'+Wj(c)+"</div></form>";
    a=B('<div class="firebaseui-resend-container"><span class="firebaseui-id-resend-countdown"></span><a href="javascript:void(0)" class="firebaseui-id-resend-link firebaseui-hidden firebaseui-link">Resend</a></div>');return B(b+(c+a+"</div>"))}bl.a="firebaseui.auth.soy2.page.phoneSignInFinish";function cl(){return B('<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-sign-out"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign Out</h1></div><div class="firebaseui-card-content"><p class="firebaseui-text">You are now successfully signed out.</p></div></div>')}
    cl.a="firebaseui.auth.soy2.page.signOut";function dl(a,b,c){var d='<div class="firebaseui-container firebaseui-page-select-tenant firebaseui-id-page-select-tenant"><div class="firebaseui-card-content"><form onsubmit="return false;"><ul class="firebaseui-tenant-list">';a=a.cc;b=a.length;for(var e=0;e<b;e++){var f=a[e];var g="";var h=A(f.displayName),k=f.tenantId?f.tenantId:"top-level-project";k=D(k);g+='<button class="firebaseui-tenant-button mdl-button mdl-js-button mdl-button--raised firebaseui-tenant-selection-'+
    vd(k)+' firebaseui-id-tenant-selection-button"'+(f.tenantId?'data-tenant-id="'+vd(f.tenantId)+'"':"")+'style="background-color:'+vd(Ed(f.ta))+'"><span class="firebaseui-idp-icon-wrapper"><img class="firebaseui-idp-icon" alt="" src="'+vd(Ad(f.za))+'"></span><span class="firebaseui-idp-text firebaseui-idp-text-long">';f.V?g+=A(f.V):(f="Sign in to "+A(f.displayName),g+=f);g=B(g+('</span><span class="firebaseui-idp-text firebaseui-idp-text-short">'+h+"</span></button>"));d+='<li class="firebaseui-list-item">'+
    g+"</li>";}d+='</ul></form></div><div class="firebaseui-card-footer firebaseui-provider-sign-in-footer">'+Xj(c)+"</div></div>";return B(d)}dl.a="firebaseui.auth.soy2.page.selectTenant";function el(a,b,c){a='<div class="mdl-card mdl-shadow--2dp firebaseui-container firebaseui-id-page-provider-match-by-email"><form onsubmit="return false;"><div class="firebaseui-card-header"><h1 class="firebaseui-title">Sign in</h1></div><div class="firebaseui-card-content"><div class="firebaseui-relative-wrapper">'+
    Nj(null)+'</div></div><div class="firebaseui-card-actions"><div class="firebaseui-form-actions">'+Oj(null)+'</div></div><div class="firebaseui-card-footer">'+Xj(c)+"</div></form></div>";return B(a)}el.a="firebaseui.auth.soy2.page.providerMatchByEmail";function fl(){return M(this,"firebaseui-id-submit")}function gl(){return M(this,"firebaseui-id-secondary-link")}function hl(a,b){O(this,fl.call(this),function(d){a(d);});var c=gl.call(this);c&&b&&O(this,c,function(d){b(d);});}function il(){return M(this,
    "firebaseui-id-password")}function jl(){return M(this,"firebaseui-id-password-error")}function kl(){var a=il.call(this),b=jl.call(this);Gj(this,a,function(){Mj(b)&&(N(a,!0),Kj(b));});}function ll(){var a=il.call(this);var b=jl.call(this);Ti(a)?(N(a,!0),Kj(b),b=!0):(N(a,!1),Lj(b,C("Enter your password").toString()),b=!1);return b?Ti(a):null}function ml(a,b,c,d,e,f){P.call(this,Gk,{email:a},f,"passwordLinking",{F:d,D:e});this.w=b;this.H=c;}m(ml,P);ml.prototype.v=function(){this.P();this.M(this.w,this.H);
    sk(this,this.i(),this.w);this.i().focus();P.prototype.v.call(this);};ml.prototype.m=function(){this.w=null;P.prototype.m.call(this);};ml.prototype.j=function(){return Ti(M(this,"firebaseui-id-email"))};u(ml.prototype,{i:il,B:jl,P:kl,u:ll,ea:fl,ba:gl,M:hl});var nl=/^[+a-zA-Z0-9_.!#$%&'*\/=?^`{|}~-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z0-9]{2,63}$/;function ol(){return M(this,"firebaseui-id-email")}function pl(){return M(this,"firebaseui-id-email-error")}function ql(a){var b=ol.call(this),c=pl.call(this);Gj(this,
    b,function(){Mj(c)&&(N(b,!0),Kj(c));});a&&Hj(this,b,function(){a();});}function rl(){return Va(Ti(ol.call(this))||"")}function sl(){var a=ol.call(this);var b=pl.call(this);var c=Ti(a)||"";c?nl.test(c)?(N(a,!0),Kj(b),b=!0):(N(a,!1),Lj(b,C("That email address isn't correct").toString()),b=!1):(N(a,!1),Lj(b,C("Enter your email address to continue").toString()),b=!1);return b?Va(Ti(a)):null}function tl(a,b,c,d,e,f,g){P.call(this,uk,{email:c,ia:!!f},g,"passwordSignIn",{F:d,D:e});this.w=a;this.H=b;}m(tl,P);
    tl.prototype.v=function(){this.P();this.ea();this.ba(this.w,this.H);rk(this,this.l(),this.i());sk(this,this.i(),this.w);Ti(this.l())?this.i().focus():this.l().focus();P.prototype.v.call(this);};tl.prototype.m=function(){this.H=this.w=null;P.prototype.m.call(this);};u(tl.prototype,{l:ol,U:pl,P:ql,M:rl,j:sl,i:il,B:jl,ea:kl,u:ll,ua:fl,pa:gl,ba:hl});function R(a,b,c,d,e,f){P.call(this,a,b,d,e||"notice",f);this.i=c||null;}w(R,P);R.prototype.v=function(){this.i&&(this.u(this.i),this.l().focus());R.K.v.call(this);};
    R.prototype.m=function(){this.i=null;R.K.m.call(this);};u(R.prototype,{l:fl,w:gl,u:hl});function ul(a,b,c,d,e){R.call(this,xk,{email:a,G:!!b},b,e,"passwordRecoveryEmailSent",{F:c,D:d});}w(ul,R);function vl(a,b){R.call(this,Qk,{G:!!a},a,b,"emailVerificationSuccess");}w(vl,R);function wl(a,b){R.call(this,Rk,{G:!!a},a,b,"emailVerificationFailure");}w(wl,R);function xl(a,b,c){R.call(this,Sk,{email:a,G:!!b},b,c,"verifyAndChangeEmailSuccess");}w(xl,R);function yl(a,b){R.call(this,Tk,{G:!!a},a,b,"verifyAndChangeEmailFailure");}
    w(yl,R);function zl(a,b){R.call(this,Wk,{G:!!a},a,b,"revertSecondFactorAdditionFailure");}w(zl,R);function Al(a){R.call(this,cl,void 0,void 0,a,"signOut");}w(Al,R);function Bl(a,b){R.call(this,Mk,{G:!!a},a,b,"passwordResetSuccess");}w(Bl,R);function Cl(a,b){R.call(this,Nk,{G:!!a},a,b,"passwordResetFailure");}w(Cl,R);function Dl(a,b){R.call(this,Pk,{G:!!a},a,b,"emailChangeRevokeFailure");}w(Dl,R);function El(a,b,c){R.call(this,Xk,{errorMessage:a,yb:!!b},b,c,"recoverableError");}w(El,R);function Fl(a,b){R.call(this,
    Yk,{errorMessage:a},void 0,b,"unrecoverableError");}w(Fl,R);function Gl(a,b,c,d){function e(g){if(!g.name||"cancel"!=g.name){a:{var h=g.message;try{var k=((JSON.parse(h).error||{}).message||"").toLowerCase().match(/invalid.+(access|id)_token/);if(k&&k.length){var p=!0;break a}}catch(r){}p=!1;}if(p)g=Q(b),b.o(),S(a,g,void 0,C("Your sign-in session has expired. Please try again.").toString());else {p=g&&g.message||"";if(g.code){if("auth/email-already-in-use"==g.code||"auth/credential-already-in-use"==
    g.code)return;p=T(g);}b.a(p);}}}Hl(a);if(d)return Il(a,c),G();if(!c.credential)throw Error("No credential found!");if(!U(a).currentUser&&!c.user)throw Error("User not logged in.");try{var f=Jl(a,c);}catch(g){return og(g.code||g.message,g),b.a(g.code||g.message),G()}c=f.then(function(g){Il(a,g);},e).then(void 0,e);V(a,f);return G(c)}function Il(a,b){if(!b.user)throw Error("No user found");var c=Hi(W(a));Fi(W(a))&&c&&tg("Both signInSuccess and signInSuccessWithAuthResult callbacks are provided. Only signInSuccessWithAuthResult callback will be invoked.");
    if(c){c=Hi(W(a));var d=yh(X(a))||void 0;wh(sh,X(a));var e=!1;if(qf()){if(!c||c(b,d))e=!0,Oc(window.opener.location,Kl(a,d));c||window.close();}else if(!c||c(b,d))e=!0,Oc(window.location,Kl(a,d));e||a.reset();}else {c=b.user;b=b.credential;d=Fi(W(a));e=yh(X(a))||void 0;wh(sh,X(a));var f=!1;if(qf()){if(!d||d(c,b,e))f=!0,Oc(window.opener.location,Kl(a,e));d||window.close();}else if(!d||d(c,b,e))f=!0,Oc(window.location,Kl(a,e));f||a.reset();}}function Kl(a,b){a=b||W(a).a.get("signInSuccessUrl");if(!a)throw Error("No redirect URL has been found. You must either specify a signInSuccessUrl in the configuration, pass in a redirect URL to the widget URL, or return false from the callback.");
    return a}function T(a){var b={code:a.code};b=b||{};var c="";switch(b.code){case "auth/email-already-in-use":c+="The email address is already used by another account";break;case "auth/requires-recent-login":c+=Nd();break;case "auth/too-many-requests":c+="You have entered an incorrect password too many times. Please try again in a few minutes.";break;case "auth/user-cancelled":c+="Please authorize the required permissions to sign in to the application";break;case "auth/user-not-found":c+="That email address doesn't match an existing account";
    break;case "auth/user-token-expired":c+=Nd();break;case "auth/weak-password":c+="Strong passwords have at least 6 characters and a mix of letters and numbers";break;case "auth/wrong-password":c+="The email and password you entered don't match";break;case "auth/network-request-failed":c+="A network error has occurred";break;case "auth/invalid-phone-number":c+=Id();break;case "auth/invalid-verification-code":c+=C("Wrong code. Try again.");break;case "auth/code-expired":c+="This code is no longer valid";
    break;case "auth/expired-action-code":c+="This code has expired.";break;case "auth/invalid-action-code":c+="The action code is invalid. This can happen if the code is malformed, expired, or has already been used.";}if(b=C(c).toString())return b;try{return JSON.parse(a.message),og("Internal error: "+a.message,void 0),Kd().toString()}catch(d){return a.message}}function Ll(a,b,c){var d=ai[b]&&index_cjs$3.auth[ai[b]]?new index_cjs$3.auth[ai[b]]:0==b.indexOf("saml.")?new index_cjs$3.auth.SAMLAuthProvider(b):new index_cjs$3.auth.OAuthProvider(b);
    if(!d)throw Error("Invalid Firebase Auth provider!");var e=qi(W(a),b);if(d.addScope)for(var f=0;f<e.length;f++)d.addScope(e[f]);e=ri(W(a),b)||{};c&&(b==index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID?a="login_hint":b==index_cjs$3.auth.GithubAuthProvider.PROVIDER_ID?a="login":a=(a=ii(W(a),b))&&a.Mb,a&&(e[a]=c));d.setCustomParameters&&d.setCustomParameters(e);return d}function Ml(a,b,c,d){function e(){Dh(new Dg(a.h.tenantId||null),X(a));V(a,b.I(t(a.bc,a),[k],function(){if("file:"===(window.location&&window.location.protocol))return V(a,
    Nl(a).then(function(p){b.o();wh(rh,X(a));L("callback",a,h,G(p));},f))},g));}function f(p){wh(rh,X(a));if(!p.name||"cancel"!=p.name)switch(p.code){case "auth/popup-blocked":e();break;case "auth/popup-closed-by-user":case "auth/cancelled-popup-request":break;case "auth/credential-already-in-use":break;case "auth/network-request-failed":case "auth/too-many-requests":case "auth/user-cancelled":b.a(T(p));break;default:b.o(),L("callback",a,h,df(p));}}function g(p){wh(rh,X(a));p.name&&"cancel"==p.name||(og("signInWithRedirect: "+
    p.code,void 0),p=T(p),"blank"==b.Ga&&Bi(W(a))?(b.o(),L("providerSignIn",a,h,p)):b.a(p));}var h=Q(b),k=Ll(a,c,d);Ci(W(a))==Di?e():V(a,Ol(a,k).then(function(p){b.o();L("callback",a,h,G(p));},f));}function Pl(a,b){V(a,b.I(t(a.Yb,a),[],function(c){b.o();return Gl(a,b,c,!0)},function(c){c.name&&"cancel"==c.name||(og("ContinueAsGuest: "+c.code,void 0),c=T(c),b.a(c));}));}function Ql(a,b,c){function d(f){var g=!1;f=b.I(t(a.Zb,a),[f],function(h){var k=Q(b);b.o();L("callback",a,k,G(h));g=!0;},function(h){if(!h.name||
    "cancel"!=h.name)if(!h||"auth/credential-already-in-use"!=h.code)if(h&&"auth/email-already-in-use"==h.code&&h.email&&h.credential){var k=Q(b);b.o();L("callback",a,k,df(h));}else h=T(h),b.a(h);});V(a,f);return f.then(function(){return g},function(){return !1})}if(c&&c.credential&&c.clientId===li(W(a))){if(qi(W(a),index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID).length){try{var e=JSON.parse(atob(c.credential.split(".")[1])).email;}catch(f){}Ml(a,b,index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID,e);return G(!0)}return d(index_cjs$3.auth.GoogleAuthProvider.credential(c.credential))}c&&
    b.a(C("The selected credential for the authentication provider is not supported!").toString());return G(!1)}function Rl(a,b){var c=b.j(),d=b.u();if(c)if(d){var e=index_cjs$3.auth.EmailAuthProvider.credential(c,d);V(a,b.I(t(a.$b,a),[c,d],function(f){return Gl(a,b,{user:f.user,credential:e,operationType:f.operationType,additionalUserInfo:f.additionalUserInfo})},function(f){if(!f.name||"cancel"!=f.name)switch(f.code){case "auth/email-already-in-use":break;case "auth/email-exists":N(b.l(),!1);Lj(b.U(),T(f));
    break;case "auth/too-many-requests":case "auth/wrong-password":N(b.i(),!1);Lj(b.B(),T(f));break;default:og("verifyPassword: "+f.message,void 0),b.a(T(f));}}));}else b.i().focus();else b.l().focus();}function Sl(a){a=hi(W(a));return 1==a.length&&a[0]==index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID}function Tl(a){a=hi(W(a));return 1==a.length&&a[0]==index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID}function S(a,b,c,d){Sl(a)?d?L("signIn",a,b,c,d):Ul(a,b,c):a&&Tl(a)&&!d?L("phoneSignInStart",a,b):a&&Bi(W(a))&&!d?
    L("federatedRedirect",a,b,c):L("providerSignIn",a,b,d,c);}function Vl(a,b,c,d){var e=Q(b);V(a,b.I(t(U(a).fetchSignInMethodsForEmail,U(a)),[c],function(f){b.o();Wl(a,e,f,c,d);},function(f){f=T(f);b.a(f);}));}function Wl(a,b,c,d,e,f){c.length||yi(W(a))?!c.length&&yi(W(a))?L("sendEmailLinkForSignIn",a,b,d,function(){L("signIn",a,b);}):Ma(c,index_cjs$3.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD)?L("passwordSignIn",a,b,d,f):1==c.length&&c[0]===index_cjs$3.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD?
    yi(W(a))?L("sendEmailLinkForSignIn",a,b,d,function(){L("signIn",a,b);}):L("unsupportedProvider",a,b,d):(c=Zh(c,hi(W(a))))?(Bh(new Ag(d),X(a)),L("federatedSignIn",a,b,d,c,e)):L("unsupportedProvider",a,b,d):L("passwordSignUp",a,b,d,void 0,void 0,f);}function Xl(a,b,c,d,e,f){var g=Q(b);V(a,b.I(t(a.Gb,a),[c,f],function(){b.o();L("emailLinkSignInSent",a,g,c,d,f);},e));}function Ul(a,b,c){c?L("prefilledEmailSignIn",a,b,c):L("signIn",a,b);}function Yl(){return ub(tf(),"oobCode")}function Zl(){var a=ub(tf(),"continueUrl");
    return a?function(){Oc(window.location,a);}:null}function $l(a,b){P.call(this,Fk,void 0,b,"anonymousUserMismatch");this.i=a;}m($l,P);$l.prototype.v=function(){var a=this;O(this,this.l(),function(){a.i();});this.l().focus();P.prototype.v.call(this);};$l.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u($l.prototype,{l:gl});K.anonymousUserMismatch=function(a,b){var c=new $l(function(){c.o();S(a,b);});c.render(b);Y(a,c);};function am(a){P.call(this,yk,void 0,a,"callback");}m(am,P);am.prototype.I=
    function(a,b,c,d){return a.apply(null,b).then(c,d)};function bm(a,b,c){if(c.user){var d={user:c.user,credential:c.credential,operationType:c.operationType,additionalUserInfo:c.additionalUserInfo},e=zh(X(a)),f=e&&e.g;if(f&&!cm(c.user,f))dm(a,b,d);else {var g=e&&e.a;g?V(a,c.user.linkWithCredential(g).then(function(h){d={user:h.user,credential:g,operationType:h.operationType,additionalUserInfo:h.additionalUserInfo};em(a,b,d);},function(h){fm(a,b,h);})):em(a,b,d);}}else c=Q(b),b.o(),Ah(X(a)),S(a,c);}function em(a,
    b,c){Ah(X(a));Gl(a,b,c);}function fm(a,b,c){var d=Q(b);Ah(X(a));c=T(c);b.o();S(a,d,void 0,c);}function gm(a,b,c,d){var e=Q(b);V(a,U(a).fetchSignInMethodsForEmail(c).then(function(f){b.o();f.length?Ma(f,index_cjs$3.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD)?L("passwordLinking",a,e,c):1==f.length&&f[0]===index_cjs$3.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD?L("emailLinkSignInLinking",a,e,c):(f=Zh(f,hi(W(a))))?L("federatedLinking",a,e,c,f,d):(Ah(X(a)),L("unsupportedProvider",a,e,c)):(Ah(X(a)),
    L("passwordRecovery",a,e,c,!1,Ld().toString()));},function(f){fm(a,b,f);}));}function dm(a,b,c){var d=Q(b);V(a,hm(a).then(function(){b.o();L("emailMismatch",a,d,c);},function(e){e.name&&"cancel"==e.name||(e=T(e.code),b.a(e));}));}function cm(a,b){if(b==a.email)return !0;if(a.providerData)for(var c=0;c<a.providerData.length;c++)if(b==a.providerData[c].email)return !0;return !1}K.callback=function(a,b,c){var d=new am;d.render(b);Y(a,d);b=c||Nl(a);V(a,b.then(function(e){bm(a,d,e);},function(e){if(e&&("auth/account-exists-with-different-credential"==
    e.code||"auth/email-already-in-use"==e.code)&&e.email&&e.credential)Bh(new Ag(e.email,e.credential),X(a)),gm(a,d,e.email);else if(e&&"auth/user-cancelled"==e.code){var f=zh(X(a)),g=T(e);f&&f.a?gm(a,d,f.g,g):f?Vl(a,d,f.g,g):fm(a,d,e);}else e&&"auth/credential-already-in-use"==e.code||(e&&"auth/operation-not-supported-in-this-environment"==e.code&&Sl(a)?bm(a,d,{user:null,credential:null}):fm(a,d,e));}));};function im(a,b){P.call(this,Ek,void 0,b,"differentDeviceError");this.i=a;}m(im,P);im.prototype.v=
    function(){var a=this;O(this,this.l(),function(){a.i();});this.l().focus();P.prototype.v.call(this);};im.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(im.prototype,{l:gl});K.differentDeviceError=function(a,b){var c=new im(function(){c.o();S(a,b);});c.render(b);Y(a,c);};function jm(a,b,c,d){P.call(this,Ok,{email:a,G:!!c},d,"emailChangeRevoke");this.l=b;this.i=c||null;}m(jm,P);jm.prototype.v=function(){var a=this;O(this,M(this,"firebaseui-id-reset-password-link"),function(){a.l();});this.i&&
    (this.w(this.i),this.u().focus());P.prototype.v.call(this);};jm.prototype.m=function(){this.l=this.i=null;P.prototype.m.call(this);};u(jm.prototype,{u:fl,B:gl,w:hl});function km(){return M(this,"firebaseui-id-new-password")}function lm(){return M(this,"firebaseui-id-password-toggle")}function mm(){this.Ra=!this.Ra;var a=lm.call(this),b=km.call(this);this.Ra?(b.type="text",Ri(a,"firebaseui-input-toggle-off"),Si(a,"firebaseui-input-toggle-on")):(b.type="password",Ri(a,"firebaseui-input-toggle-on"),Si(a,
    "firebaseui-input-toggle-off"));b.focus();}function nm(){return M(this,"firebaseui-id-new-password-error")}function om(){this.Ra=!1;var a=km.call(this);a.type="password";var b=nm.call(this);Gj(this,a,function(){Mj(b)&&(N(a,!0),Kj(b));});var c=lm.call(this);Ri(c,"firebaseui-input-toggle-on");Si(c,"firebaseui-input-toggle-off");Ij(this,a,function(){Ri(c,"firebaseui-input-toggle-focus");Si(c,"firebaseui-input-toggle-blur");});Jj(this,a,function(){Ri(c,"firebaseui-input-toggle-blur");Si(c,"firebaseui-input-toggle-focus");});
    O(this,c,t(mm,this));}function pm(){var a=km.call(this);var b=nm.call(this);Ti(a)?(N(a,!0),Kj(b),b=!0):(N(a,!1),Lj(b,C("Enter your password").toString()),b=!1);return b?Ti(a):null}function qm(a,b,c){P.call(this,Lk,{email:a},c,"passwordReset");this.l=b;}m(qm,P);qm.prototype.v=function(){this.H();this.B(this.l);sk(this,this.i(),this.l);this.i().focus();P.prototype.v.call(this);};qm.prototype.m=function(){this.l=null;P.prototype.m.call(this);};u(qm.prototype,{i:km,w:nm,M:lm,H:om,u:pm,U:fl,P:gl,B:hl});function rm(a,
    b,c,d,e){P.call(this,Uk,{factorId:a,phoneNumber:c||null,G:!!d},e,"revertSecondFactorAdditionSuccess");this.l=b;this.i=d||null;}m(rm,P);rm.prototype.v=function(){var a=this;O(this,M(this,"firebaseui-id-reset-password-link"),function(){a.l();});this.i&&(this.w(this.i),this.u().focus());P.prototype.v.call(this);};rm.prototype.m=function(){this.l=this.i=null;P.prototype.m.call(this);};u(rm.prototype,{u:fl,B:gl,w:hl});function sm(a,b,c,d,e){var f=c.u();f&&V(a,c.I(t(U(a).confirmPasswordReset,U(a)),[d,f],function(){c.o();
    var g=new Bl(e);g.render(b);Y(a,g);},function(g){tm(a,b,c,g);}));}function tm(a,b,c,d){"auth/weak-password"==(d&&d.code)?(a=T(d),N(c.i(),!1),Lj(c.w(),a),c.i().focus()):(c&&c.o(),c=new Cl,c.render(b),Y(a,c));}function um(a,b,c){var d=new jm(c,function(){V(a,d.I(t(U(a).sendPasswordResetEmail,U(a)),[c],function(){d.o();d=new ul(c,void 0,J(W(a)),wi(W(a)));d.render(b);Y(a,d);},function(){d.a(Jd().toString());}));});d.render(b);Y(a,d);}function vm(a,b,c,d){var e=new rm(d.factorId,function(){e.I(t(U(a).sendPasswordResetEmail,
    U(a)),[c],function(){e.o();e=new ul(c,void 0,J(W(a)),wi(W(a)));e.render(b);Y(a,e);},function(){e.a(Jd().toString());});},d.phoneNumber);e.render(b);Y(a,e);}K.passwordReset=function(a,b,c,d){V(a,U(a).verifyPasswordResetCode(c).then(function(e){var f=new qm(e,function(){sm(a,b,f,c,d);});f.render(b);Y(a,f);},function(){tm(a,b);}));};K.emailChangeRevocation=function(a,b,c){var d=null;V(a,U(a).checkActionCode(c).then(function(e){d=e.data.email;return U(a).applyActionCode(c)}).then(function(){um(a,b,d);},function(){var e=
    new Dl;e.render(b);Y(a,e);}));};K.emailVerification=function(a,b,c,d){V(a,U(a).applyActionCode(c).then(function(){var e=new vl(d);e.render(b);Y(a,e);},function(){var e=new wl;e.render(b);Y(a,e);}));};K.revertSecondFactorAddition=function(a,b,c){var d=null,e=null;V(a,U(a).checkActionCode(c).then(function(f){d=f.data.email;e=f.data.multiFactorInfo;return U(a).applyActionCode(c)}).then(function(){vm(a,b,d,e);},function(){var f=new zl;f.render(b);Y(a,f);}));};K.verifyAndChangeEmail=function(a,b,c,d){var e=null;
    V(a,U(a).checkActionCode(c).then(function(f){e=f.data.email;return U(a).applyActionCode(c)}).then(function(){var f=new xl(e,d);f.render(b);Y(a,f);},function(){var f=new yl;f.render(b);Y(a,f);}));};function wm(a,b){try{var c="number"==typeof a.selectionStart;}catch(d){c=!1;}c?(a.selectionStart=b,a.selectionEnd=b):z&&!nc("9")&&("textarea"==a.type&&(b=a.value.substring(0,b).replace(/(\r\n|\r|\n)/g,"\n").length),a=a.createTextRange(),a.collapse(!0),a.move("character",b),a.select());}function xm(a,b,c,d,e,f){P.call(this,
    Dk,{email:c},f,"emailLinkSignInConfirmation",{F:d,D:e});this.l=a;this.u=b;}m(xm,P);xm.prototype.v=function(){this.w(this.l);this.B(this.l,this.u);this.i().focus();wm(this.i(),(this.i().value||"").length);P.prototype.v.call(this);};xm.prototype.m=function(){this.u=this.l=null;P.prototype.m.call(this);};u(xm.prototype,{i:ol,M:pl,w:ql,H:rl,j:sl,U:fl,P:gl,B:hl});K.emailLinkConfirmation=function(a,b,c,d,e,f){var g=new xm(function(){var h=g.j();h?(g.o(),d(a,b,h,c)):g.i().focus();},function(){g.o();S(a,b,e||
    void 0);},e||void 0,J(W(a)),wi(W(a)));g.render(b);Y(a,g);f&&g.a(f);};function ym(a,b,c,d,e){P.call(this,Ik,{ga:a},e,"emailLinkSignInLinkingDifferentDevice",{F:c,D:d});this.i=b;}m(ym,P);ym.prototype.v=function(){this.u(this.i);this.l().focus();P.prototype.v.call(this);};ym.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(ym.prototype,{l:fl,u:hl});K.emailLinkNewDeviceLinking=function(a,b,c,d){var e=new Qb(c);c=e.a.a.get(x.PROVIDER_ID)||null;Ub(e,null);if(c){var f=new ym(ii(W(a),c),function(){f.o();
    d(a,b,e.toString());},J(W(a)),wi(W(a)));f.render(b);Y(a,f);}else S(a,b);};function zm(a){P.call(this,Ak,void 0,a,"blank");}m(zm,P);function Am(a,b,c,d,e){var f=new zm,g=new Qb(c),h=g.a.a.get(x.$a)||"",k=g.a.a.get(x.Sa)||"",p="1"===g.a.a.get(x.Qa),r=Tb(g),H=g.a.a.get(x.PROVIDER_ID)||null;g=g.a.a.get(x.vb)||null;Bm(a,g);var Ba=!vh(th,X(a)),Vk=d||Eh(k,X(a)),jd=(d=Fh(k,X(a)))&&d.a;H&&jd&&jd.providerId!==H&&(jd=null);f.render(b);Y(a,f);V(a,f.I(function(){var xa=G(null);xa=r&&Ba||Ba&&p?df(Error("anonymous-user-not-found")):
    Cm(a,c).then(function(ug){if(H&&!jd)throw Error("pending-credential-not-found");return ug});var kd=null;return xa.then(function(ug){kd=ug;return e?null:U(a).checkActionCode(h)}).then(function(){return kd})},[],function(xa){Vk?Dm(a,f,Vk,c,jd,xa):p?(f.o(),L("differentDeviceError",a,b)):(f.o(),L("emailLinkConfirmation",a,b,c,Em));},function(xa){var kd=void 0;if(!xa||!xa.name||"cancel"!=xa.name)switch(f.o(),xa&&xa.message){case "anonymous-user-not-found":L("differentDeviceError",a,b);break;case "anonymous-user-mismatch":L("anonymousUserMismatch",
    a,b);break;case "pending-credential-not-found":L("emailLinkNewDeviceLinking",a,b,c,Fm);break;default:xa&&(kd=T(xa)),S(a,b,void 0,kd);}}));}function Em(a,b,c,d){Am(a,b,d,c,!0);}function Fm(a,b,c){Am(a,b,c);}function Dm(a,b,c,d,e,f){var g=Q(b);b.$("mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active firebaseui-progress-dialog-loading-icon",C("Signing in...").toString());var h=null;e=(f?Gm(a,f,c,d,e):Hm(a,c,d,e)).then(function(k){wh(uh,X(a));wh(th,X(a));b.h();b.$("firebaseui-icon-done",C("Signed in!").toString());
    h=setTimeout(function(){b.h();Gl(a,b,k,!0);},1E3);V(a,function(){b&&(b.h(),b.o());clearTimeout(h);});},function(k){b.h();b.o();if(!k.name||"cancel"!=k.name){var p=T(k);"auth/email-already-in-use"==k.code||"auth/credential-already-in-use"==k.code?(wh(uh,X(a)),wh(th,X(a))):"auth/invalid-email"==k.code?(p=C("The email provided does not match the current sign-in session.").toString(),L("emailLinkConfirmation",a,g,d,Em,null,p)):S(a,g,c,p);}});V(a,e);}K.emailLinkSignInCallback=Am;function Im(a,b,c,d,e,f){P.call(this,
    Hk,{email:a,ga:b},f,"emailLinkSignInLinking",{F:d,D:e});this.i=c;}m(Im,P);Im.prototype.v=function(){this.u(this.i);this.l().focus();P.prototype.v.call(this);};Im.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(Im.prototype,{l:fl,u:hl});function Jm(a,b,c,d){var e=Q(b);Xl(a,b,c,function(){S(a,e,c);},function(f){if(!f.name||"cancel"!=f.name){var g=T(f);f&&"auth/network-request-failed"==f.code?b.a(g):(b.o(),S(a,e,c,g));}},d);}K.emailLinkSignInLinking=function(a,b,c){var d=zh(X(a));Ah(X(a));
    if(d){var e=d.a.providerId,f=new Im(c,ii(W(a),e),function(){Jm(a,f,c,d);},J(W(a)),wi(W(a)));f.render(b);Y(a,f);}else S(a,b);};function Km(a,b,c,d,e,f){P.call(this,Bk,{email:a},f,"emailLinkSignInSent",{F:d,D:e});this.u=b;this.i=c;}m(Km,P);Km.prototype.v=function(){var a=this;O(this,this.l(),function(){a.i();});O(this,M(this,"firebaseui-id-trouble-getting-email-link"),function(){a.u();});this.l().focus();P.prototype.v.call(this);};Km.prototype.m=function(){this.i=this.u=null;P.prototype.m.call(this);};u(Km.prototype,
    {l:gl});K.emailLinkSignInSent=function(a,b,c,d,e){var f=new Km(c,function(){f.o();L("emailNotReceived",a,b,c,d,e);},function(){f.o();d();},J(W(a)),wi(W(a)));f.render(b);Y(a,f);};function Lm(a,b,c,d,e,f,g){P.call(this,Zk,{hc:a,Ob:b},g,"emailMismatch",{F:e,D:f});this.l=c;this.i=d;}m(Lm,P);Lm.prototype.v=function(){this.w(this.l,this.i);this.u().focus();P.prototype.v.call(this);};Lm.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(Lm.prototype,{u:fl,B:gl,w:hl});K.emailMismatch=function(a,b,
    c){var d=zh(X(a));if(d){var e=new Lm(c.user.email,d.g,function(){var f=e;Ah(X(a));Gl(a,f,c);},function(){var f=c.credential.providerId,g=Q(e);e.o();d.a?L("federatedLinking",a,g,d.g,f):L("federatedSignIn",a,g,d.g,f);},J(W(a)),wi(W(a)));e.render(b);Y(a,e);}else S(a,b);};function Mm(a,b,c,d,e){P.call(this,Ck,void 0,e,"emailNotReceived",{F:c,D:d});this.l=a;this.i=b;}m(Mm,P);Mm.prototype.v=function(){var a=this;O(this,this.u(),function(){a.i();});O(this,this.Da(),function(){a.l();});this.u().focus();P.prototype.v.call(this);};
    Mm.prototype.Da=function(){return M(this,"firebaseui-id-resend-email-link")};Mm.prototype.m=function(){this.i=this.l=null;P.prototype.m.call(this);};u(Mm.prototype,{u:gl});K.emailNotReceived=function(a,b,c,d,e){var f=new Mm(function(){Xl(a,f,c,d,function(g){g=T(g);f.a(g);},e);},function(){f.o();S(a,b,c);},J(W(a)),wi(W(a)));f.render(b);Y(a,f);};function Nm(a,b,c,d,e,f){P.call(this,Jk,{email:a,ga:b},f,"federatedLinking",{F:d,D:e});this.i=c;}m(Nm,P);Nm.prototype.v=function(){this.u(this.i);this.l().focus();
    P.prototype.v.call(this);};Nm.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(Nm.prototype,{l:fl,u:hl});K.federatedLinking=function(a,b,c,d,e){var f=zh(X(a));if(f&&f.a){var g=new Nm(c,ii(W(a),d),function(){Ml(a,g,d,c);},J(W(a)),wi(W(a)));g.render(b);Y(a,g);e&&g.a(e);}else S(a,b);};K.federatedRedirect=function(a,b,c){var d=new zm;d.render(b);Y(a,d);b=hi(W(a))[0];Ml(a,d,b,c);};K.federatedSignIn=function(a,b,c,d,e){var f=new Nm(c,ii(W(a),d),function(){Ml(a,f,d,c);},J(W(a)),wi(W(a)));f.render(b);
    Y(a,f);e&&f.a(e);};function Om(a,b,c,d){var e=b.u();e?V(a,b.I(t(a.Vb,a),[c,e],function(f){f=f.user.linkWithCredential(d).then(function(g){return Gl(a,b,{user:g.user,credential:d,operationType:g.operationType,additionalUserInfo:g.additionalUserInfo})});V(a,f);return f},function(f){if(!f.name||"cancel"!=f.name)switch(f.code){case "auth/wrong-password":N(b.i(),!1);Lj(b.B(),T(f));break;case "auth/too-many-requests":b.a(T(f));break;default:og("signInWithEmailAndPassword: "+f.message,void 0),b.a(T(f));}})):
    b.i().focus();}K.passwordLinking=function(a,b,c){var d=zh(X(a));Ah(X(a));var e=d&&d.a;if(e){var f=new ml(c,function(){Om(a,f,c,e);},function(){f.o();L("passwordRecovery",a,b,c);},J(W(a)),wi(W(a)));f.render(b);Y(a,f);}else S(a,b);};function Pm(a,b,c,d,e,f){P.call(this,wk,{email:c,Ta:!!b},f,"passwordRecovery",{F:d,D:e});this.l=a;this.u=b;}m(Pm,P);Pm.prototype.v=function(){this.B();this.H(this.l,this.u);Ti(this.i())||this.i().focus();sk(this,this.i(),this.l);P.prototype.v.call(this);};Pm.prototype.m=function(){this.u=
    this.l=null;P.prototype.m.call(this);};u(Pm.prototype,{i:ol,w:pl,B:ql,M:rl,j:sl,U:fl,P:gl,H:hl});function Qm(a,b){var c=b.j();if(c){var d=Q(b);V(a,b.I(t(U(a).sendPasswordResetEmail,U(a)),[c],function(){b.o();var e=new ul(c,function(){e.o();S(a,d);},J(W(a)),wi(W(a)));e.render(d);Y(a,e);},function(e){N(b.i(),!1);Lj(b.w(),T(e));}));}else b.i().focus();}K.passwordRecovery=function(a,b,c,d,e){var f=new Pm(function(){Qm(a,f);},d?void 0:function(){f.o();S(a,b);},c,J(W(a)),wi(W(a)));f.render(b);Y(a,f);e&&f.a(e);};
    K.passwordSignIn=function(a,b,c,d){var e=new tl(function(){Rl(a,e);},function(){var f=e.M();e.o();L("passwordRecovery",a,b,f);},c,J(W(a)),wi(W(a)),d);e.render(b);Y(a,e);};function Rm(){return M(this,"firebaseui-id-name")}function Sm(){return M(this,"firebaseui-id-name-error")}function Tm(a,b,c,d,e,f,g,h,k){P.call(this,vk,{email:d,Rb:a,name:e,Ta:!!c,ia:!!h},k,"passwordSignUp",{F:f,D:g});this.w=b;this.H=c;this.B=a;}m(Tm,P);Tm.prototype.v=function(){this.ea();this.B&&this.Ja();this.ua();this.pa(this.w,this.H);
    this.B?(rk(this,this.i(),this.u()),rk(this,this.u(),this.l())):rk(this,this.i(),this.l());this.w&&sk(this,this.l(),this.w);Ti(this.i())?this.B&&!Ti(this.u())?this.u().focus():this.l().focus():this.i().focus();P.prototype.v.call(this);};Tm.prototype.m=function(){this.H=this.w=null;P.prototype.m.call(this);};u(Tm.prototype,{i:ol,U:pl,ea:ql,jb:rl,j:sl,u:Rm,zc:Sm,Ja:function(){var a=Rm.call(this),b=Sm.call(this);Gj(this,a,function(){Mj(b)&&(N(a,!0),Kj(b));});},M:function(){var a=Rm.call(this);var b=Sm.call(this);
    var c=Ti(a);c=!/^[\s\xa0]*$/.test(null==c?"":String(c));N(a,c);c?(Kj(b),b=!0):(Lj(b,C("Enter your account name").toString()),b=!1);return b?Va(Ti(a)):null},l:km,ba:nm,lb:lm,ua:om,P:pm,Lb:fl,Kb:gl,pa:hl});function Um(a,b){var c=xi(W(a)),d=b.j(),e=null;c&&(e=b.M());var f=b.P();if(d){if(c)if(e)e=db(e);else {b.u().focus();return}if(f){var g=index_cjs$3.auth.EmailAuthProvider.credential(d,f);V(a,b.I(t(a.Wb,a),[d,f],function(h){var k={user:h.user,credential:g,operationType:h.operationType,additionalUserInfo:h.additionalUserInfo};
    return c?(h=h.user.updateProfile({displayName:e}).then(function(){return Gl(a,b,k)}),V(a,h),h):Gl(a,b,k)},function(h){if(!h.name||"cancel"!=h.name){var k=T(h);switch(h.code){case "auth/email-already-in-use":return Vm(a,b,d,h);case "auth/too-many-requests":k=C("Too many account requests are coming from your IP address. Try again in a few minutes.").toString();case "auth/operation-not-allowed":case "auth/weak-password":N(b.l(),!1);Lj(b.ba(),k);break;default:h="setAccountInfo: "+ah(h),og(h,void 0),b.a(k);}}}));}else b.l().focus();}else b.i().focus();}
    function Vm(a,b,c,d){function e(){var g=T(d);N(b.i(),!1);Lj(b.U(),g);b.i().focus();}var f=U(a).fetchSignInMethodsForEmail(c).then(function(g){g.length?e():(g=Q(b),b.o(),L("passwordRecovery",a,g,c,!1,Ld().toString()));},function(){e();});V(a,f);return f}K.passwordSignUp=function(a,b,c,d,e,f){function g(){h.o();S(a,b);}var h=new Tm(xi(W(a)),function(){Um(a,h);},e?void 0:g,c,d,J(W(a)),wi(W(a)),f);h.render(b);Y(a,h);};function Wm(){return M(this,"firebaseui-id-phone-confirmation-code")}function Xm(){return M(this,
    "firebaseui-id-phone-confirmation-code-error")}function Ym(){return M(this,"firebaseui-id-resend-countdown")}function Zm(a,b,c,d,e,f,g,h,k){P.call(this,bl,{phoneNumber:e},k,"phoneSignInFinish",{F:g,D:h});this.jb=f;this.i=new ej(1E3);this.B=f;this.P=a;this.l=b;this.H=c;this.M=d;}m(Zm,P);Zm.prototype.v=function(){var a=this;this.U(this.jb);le(this.i,"tick",this.w,!1,this);this.i.start();O(this,M(this,"firebaseui-id-change-phone-number-link"),function(){a.P();});O(this,this.Da(),function(){a.M();});this.Ja(this.l);
    this.ea(this.l,this.H);this.u().focus();P.prototype.v.call(this);};Zm.prototype.m=function(){this.M=this.H=this.l=this.P=null;fj(this.i);te(this.i,"tick",this.w);this.i=null;P.prototype.m.call(this);};Zm.prototype.w=function(){--this.B;0<this.B?this.U(this.B):(fj(this.i),te(this.i,"tick",this.w),this.ua(),this.lb());};u(Zm.prototype,{u:Wm,pa:Xm,Ja:function(a){var b=Wm.call(this),c=Xm.call(this);Gj(this,b,function(){Mj(c)&&(N(b,!0),Kj(c));});a&&Hj(this,b,function(){a();});},ba:function(){var a=Va(Ti(Wm.call(this))||
    "");return /^\d{6}$/.test(a)?a:null},Db:Ym,U:function(a){ad(Ym.call(this),C("Resend code in "+((9<a?"0:":"0:0")+a)).toString());},ua:function(){Kj(this.Db());},Da:function(){return M(this,"firebaseui-id-resend-link")},lb:function(){Lj(this.Da());},Lb:fl,Kb:gl,ea:hl});function $m(a,b,c,d){function e(g){b.u().focus();N(b.u(),!1);Lj(b.pa(),g);}var f=b.ba();f?(b.$("mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active firebaseui-progress-dialog-loading-icon",C("Verifying...").toString()),V(a,b.I(t(d.confirm,
    d),[f],function(g){b.h();b.$("firebaseui-icon-done",C("Verified!").toString());var h=setTimeout(function(){b.h();b.o();var k={user:an(a).currentUser,credential:null,operationType:g.operationType,additionalUserInfo:g.additionalUserInfo};Gl(a,b,k,!0);},1E3);V(a,function(){b&&b.h();clearTimeout(h);});},function(g){if(g.name&&"cancel"==g.name)b.h();else {var h=T(g);switch(g.code){case "auth/credential-already-in-use":b.h();break;case "auth/code-expired":g=Q(b);b.h();b.o();L("phoneSignInStart",a,g,c,h);break;
    case "auth/missing-verification-code":case "auth/invalid-verification-code":b.h();e(h);break;default:b.h(),b.a(h);}}}))):e(C("Wrong code. Try again.").toString());}K.phoneSignInFinish=function(a,b,c,d,e,f){var g=new Zm(function(){g.o();L("phoneSignInStart",a,b,c);},function(){$m(a,g,c,e);},function(){g.o();S(a,b);},function(){g.o();L("phoneSignInStart",a,b,c);},Yh(c),d,J(W(a)),wi(W(a)));g.render(b);Y(a,g);f&&g.a(f);};var bn=!z&&!(y("Safari")&&!(Yb()||y("Coast")||y("Opera")||y("Edge")||y("Firefox")||y("FxiOS")||
    y("Silk")||y("Android")));function cn(a,b){if(/-[a-z]/.test(b))return null;if(bn&&a.dataset){if(!(!y("Android")||Yb()||y("Firefox")||y("FxiOS")||y("Opera")||y("Silk")||b in a.dataset))return null;a=a.dataset[b];return void 0===a?null:a}return a.getAttribute("data-"+String(b).replace(/([A-Z])/g,"-$1").toLowerCase())}function dn(a,b,c){var d=this;a=id(bk,{items:a},null,this.s);ik.call(this,a,!0,!0);c&&(c=en(a,c))&&(c.focus(),yj(c,a));O(this,a,function(e){if(e=(e=bd(e.target,"firebaseui-id-list-box-dialog-button"))&&
    cn(e,"listboxid"))jk.call(d),b(e);});}function en(a,b){a=(a||document).getElementsByTagName("BUTTON");for(var c=0;c<a.length;c++)if(cn(a[c],"listboxid")===b)return a[c];return null}function fn(){return M(this,"firebaseui-id-phone-number")}function gn(){return M(this,"firebaseui-id-country-selector")}function hn(){return M(this,"firebaseui-id-phone-number-error")}function jn(a,b){var c=a.a,d=kn("1-US-0",c),e=null;b&&kn(b,c)?e=b:d?e="1-US-0":e=0<c.length?c[0].c:null;if(!e)throw Error("No available default country");
    ln.call(this,e,a);}function kn(a,b){a=Qh(a);return !(!a||!Ma(b,a))}function mn(a){return Ka(a,function(b){return {id:b.c,Ma:"firebaseui-flag "+nn(b),label:b.name+" "+("\u200e+"+b.b)}})}function nn(a){return "firebaseui-flag-"+a.f}function on(a){var b=this;dn.call(this,mn(a.a),function(c){ln.call(b,c,a,!0);b.O().focus();},this.Ba);}function ln(a,b,c){var d=Qh(a);d&&(c&&(c=Va(Ti(fn.call(this))||""),b=Ph(b,c),b.length&&b[0].b!=d.b&&(c="+"+d.b+c.substr(b[0].b.length+1),Ui(fn.call(this),c))),b=Qh(this.Ba),this.Ba=
    a,a=M(this,"firebaseui-id-country-selector-flag"),b&&Si(a,nn(b)),Ri(a,nn(d)),ad(M(this,"firebaseui-id-country-selector-code"),"\u200e+"+d.b));}function pn(a,b,c,d,e,f,g,h,k,p){P.call(this,al,{Eb:b,Aa:k||null,Va:!!c,ia:!!f},p,"phoneSignInStart",{F:d,D:e});this.H=h||null;this.M=b;this.l=a;this.w=c||null;this.pa=g||null;}m(pn,P);pn.prototype.v=function(){this.ea(this.pa,this.H);this.P(this.l,this.w||void 0);this.M||rk(this,this.O(),this.i());sk(this,this.i(),this.l);this.O().focus();wm(this.O(),(this.O().value||
    "").length);P.prototype.v.call(this);};pn.prototype.m=function(){this.w=this.l=null;P.prototype.m.call(this);};u(pn.prototype,{Bb:kk,O:fn,B:hn,ea:function(a,b,c){var d=this,e=fn.call(this),f=gn.call(this),g=hn.call(this),h=a||Vh,k=h.a;if(0==k.length)throw Error("No available countries provided.");jn.call(d,h,b);O(this,f,function(){on.call(d,h);});Gj(this,e,function(){Mj(g)&&(N(e,!0),Kj(g));var p=Va(Ti(e)||""),r=Qh(this.Ba),H=Ph(h,p);p=kn("1-US-0",k);H.length&&H[0].b!=r.b&&(r=H[0],ln.call(d,"1"==r.b&&
    p?"1-US-0":r.c,h));});c&&Hj(this,e,function(){c();});},U:function(a){var b=Va(Ti(fn.call(this))||"");a=a||Vh;var c=a.a,d=Ph(Vh,b);if(d.length&&!Ma(c,d[0]))throw Ui(fn.call(this)),fn.call(this).focus(),Lj(hn.call(this),C("The country code provided is not supported.").toString()),Error("The country code provided is not supported.");c=Qh(this.Ba);d.length&&d[0].b!=c.b&&ln.call(this,d[0].c,a);d.length&&(b=b.substr(d[0].b.length+1));return b?new Wh(this.Ba,b):null},Ja:gn,ba:function(){return M(this,"firebaseui-recaptcha-container")},
    u:function(){return M(this,"firebaseui-id-recaptcha-error")},i:fl,ua:gl,P:hl});function qn(a,b,c,d){try{var e=b.U(Ni);}catch(f){return}e?Li?(b.$("mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active firebaseui-progress-dialog-loading-icon",C("Verifying...").toString()),V(a,b.I(t(a.ac,a),[Yh(e),c],function(f){var g=Q(b);b.$("firebaseui-icon-done",C("Code sent!").toString());var h=setTimeout(function(){b.h();b.o();L("phoneSignInFinish",a,g,e,15,f);},1E3);V(a,function(){b&&b.h();clearTimeout(h);});},
    function(f){b.h();if(!f.name||"cancel"!=f.name){grecaptcha.reset(Oi);Li=null;var g=f&&f.message||"";if(f.code)switch(f.code){case "auth/too-many-requests":g=C("This phone number has been used too many times").toString();break;case "auth/invalid-phone-number":case "auth/missing-phone-number":b.O().focus();Lj(b.B(),Id().toString());return;default:g=T(f);}b.a(g);}}))):Mi?Lj(b.u(),C("Solve the reCAPTCHA").toString()):!Mi&&d&&b.i().click():(b.O().focus(),Lj(b.B(),Id().toString()));}K.phoneSignInStart=function(a,
    b,c,d){var e=oi(W(a))||{};Li=null;Mi=!(e&&"invisible"===e.size);var f=Tl(a),g=ti(W(a)),h=f?si(W(a)):null;g=c&&c.a||g&&g.c||null;c=c&&c.Aa||h;(h=ui(W(a)))&&Uh(h);Ni=h?new Oh(ui(W(a))):Vh;var k=new pn(function(r){qn(a,k,p,!(!r||!r.keyCode));},Mi,f?null:function(){p.clear();k.o();S(a,b);},J(W(a)),wi(W(a)),f,Ni,g,c);k.render(b);Y(a,k);d&&k.a(d);e.callback=function(r){k.u()&&Kj(k.u());Li=r;Mi||qn(a,k,p);};e["expired-callback"]=function(){Li=null;};var p=new index_cjs$3.auth.RecaptchaVerifier(Mi?k.ba():k.i(),
    e,an(a).app);V(a,k.I(t(p.render,p),[],function(r){Oi=r;},function(r){r.name&&"cancel"==r.name||(r=T(r),k.o(),S(a,b,void 0,r));}));};K.prefilledEmailSignIn=function(a,b,c){var d=new zm;d.render(b);Y(a,d);V(a,d.I(t(U(a).fetchSignInMethodsForEmail,U(a)),[c],function(e){d.o();var f=!(!Sl(a)||!rn(a));Wl(a,b,e,c,void 0,f);},function(e){e=T(e);d.o();L("signIn",a,b,c,e);}));};function sn(a,b,c,d,e){P.call(this,$k,{Qb:b},e,"providerSignIn",{F:c,D:d});this.i=a;}m(sn,P);sn.prototype.v=function(){this.l(this.i);P.prototype.v.call(this);};
    sn.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(sn.prototype,{l:function(a){function b(g){a(g);}for(var c=this.g?Uc("firebaseui-id-idp-button",this.g||this.s.a):[],d=0;d<c.length;d++){var e=c[d],f=cn(e,"providerId");O(this,e,za(b,f));}}});K.providerSignIn=function(a,b,c,d){var e=new sn(function(f){f==index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID?(e.o(),Ul(a,b,d)):f==index_cjs$3.auth.PhoneAuthProvider.PROVIDER_ID?(e.o(),L("phoneSignInStart",a,b)):"anonymous"==f?Pl(a,e):Ml(a,e,f,d);Z(a);
    a.l.cancel();},ji(W(a)),J(W(a)),wi(W(a)));e.render(b);Y(a,e);c&&e.a(c);tn(a);};K.sendEmailLinkForSignIn=function(a,b,c,d){var e=new am;e.render(b);Y(a,e);Xl(a,e,c,d,function(f){e.o();f=T(f);L("signIn",a,b,c,f);});};function un(a,b,c,d,e,f,g){P.call(this,tk,{email:c,Va:!!b,ia:!!f},g,"signIn",{F:d,D:e});this.i=a;this.u=b;}m(un,P);un.prototype.v=function(){this.w(this.i);this.B(this.i,this.u||void 0);this.l().focus();wm(this.l(),(this.l().value||"").length);P.prototype.v.call(this);};un.prototype.m=function(){this.u=
    this.i=null;P.prototype.m.call(this);};u(un.prototype,{l:ol,M:pl,w:ql,H:rl,j:sl,U:fl,P:gl,B:hl});K.signIn=function(a,b,c,d){var e=Sl(a),f=new un(function(){var g=f,h=g.j()||"";h&&Vl(a,g,h);},e?null:function(){f.o();S(a,b,c);},c,J(W(a)),wi(W(a)),e);f.render(b);Y(a,f);d&&f.a(d);};function vn(a,b,c,d,e,f){P.call(this,Kk,{email:a},f,"unsupportedProvider",{F:d,D:e});this.l=b;this.i=c;}m(vn,P);vn.prototype.v=function(){this.w(this.l,this.i);this.u().focus();P.prototype.v.call(this);};vn.prototype.m=function(){this.i=
    this.l=null;P.prototype.m.call(this);};u(vn.prototype,{u:fl,B:gl,w:hl});K.unsupportedProvider=function(a,b,c){var d=new vn(c,function(){d.o();L("passwordRecovery",a,b,c);},function(){d.o();S(a,b,c);},J(W(a)),wi(W(a)));d.render(b);Y(a,d);};function wn(a,b){this.$=!1;var c=xn(b);if(yn[c])throw Error('An AuthUI instance already exists for the key "'+c+'"');yn[c]=this;this.a=a;this.u=null;this.Y=!1;zn(this.a);this.h=index_cjs$3.initializeApp({apiKey:a.app.options.apiKey,authDomain:a.app.options.authDomain},
    a.app.name+"-firebaseui-temp").auth();zn(this.h);this.h.setPersistence&&this.h.setPersistence(index_cjs$3.auth.Auth.Persistence.SESSION);this.oa=b;this.ca=new bi;this.g=this.T=this.i=this.J=this.O=null;this.s=[];this.Z=!1;this.l=Pf.Xa();this.j=this.C=null;this.da=this.A=!1;}function zn(a){a&&a.INTERNAL&&a.INTERNAL.logFramework&&a.INTERNAL.logFramework("FirebaseUI-web");}var yn={};function xn(a){return a||"[DEFAULT]"}function Nl(a){Z(a);a.i||(a.i=An(a,function(b){return b&&!zh(X(a))?G(an(a).getRedirectResult().then(function(c){return c},
    function(c){if(c&&"auth/email-already-in-use"==c.code&&c.email&&c.credential)throw c;return Bn(a,c)})):G(U(a).getRedirectResult().then(function(c){return di(W(a))&&!c.user&&a.j&&!a.j.isAnonymous?an(a).getRedirectResult():c}))}));return a.i}function Y(a,b){Z(a);a.g=b;}var Cn=null;function U(a){Z(a);return a.h}function an(a){Z(a);return a.a}function X(a){Z(a);return a.oa}function rn(a){Z(a);return a.O?a.O.emailHint:void 0}l=wn.prototype;l.nb=function(){Z(this);return !!Ch(X(this))||Dn(tf())};function Dn(a){a=
    new Qb(a);return "signIn"===(a.a.a.get(x.ub)||null)&&!!a.a.a.get(x.$a)}l.start=function(a,b){En(this,a,b);};function En(a,b,c,d){Z(a);"undefined"!==typeof a.a.languageCode&&(a.u=a.a.languageCode);var e="en".replace(/_/g,"-");a.a.languageCode=e;a.h.languageCode=e;a.Y=!0;"undefined"!==typeof a.a.tenantId&&(a.h.tenantId=a.a.tenantId);a.ib(c);a.O=d||null;var f=n.document;a.C?a.C.then(function(){"complete"==f.readyState?Fn(a,b):me(window,"load",function(){Fn(a,b);});}):"complete"==f.readyState?Fn(a,b):me(window,
    "load",function(){Fn(a,b);});}function Fn(a,b){var c=sf(b,"Could not find the FirebaseUI widget element on the page.");c.setAttribute("lang","en".replace(/_/g,"-"));if(Cn){var d=Cn;Z(d);zh(X(d))&&tg("UI Widget is already rendered on the page and is pending some user interaction. Only one widget instance can be rendered per page. The previous instance has been automatically reset.");Cn.reset();}Cn=a;a.T=c;Gn(a,c);if(jh(new kh)&&jh(new lh)){b=sf(b,"Could not find the FirebaseUI widget element on the page.");
    c=tf();d=Jh(W(a).a,"queryParameterForSignInSuccessUrl");c=(c=ub(c,d))?Ac(Cc(c)).toString():null;a:{d=tf();var e=vi(W(a));d=ub(d,e)||"";for(f in Ki)if(Ki[f].toLowerCase()==d.toLowerCase()){var f=Ki[f];break a}f="callback";}switch(f){case "callback":c&&(f=X(a),xh(sh,c,f));a.nb()?L("callback",a,b):S(a,b,rn(a));break;case "resetPassword":L("passwordReset",a,b,Yl(),Zl());break;case "recoverEmail":L("emailChangeRevocation",a,b,Yl());break;case "revertSecondFactorAddition":L("revertSecondFactorAddition",
    a,b,Yl());break;case "verifyEmail":L("emailVerification",a,b,Yl(),Zl());break;case "verifyAndChangeEmail":L("verifyAndChangeEmail",a,b,Yl(),Zl());break;case "signIn":L("emailLinkSignInCallback",a,b,tf());Hn();break;case "select":c&&(f=X(a),xh(sh,c,f));S(a,b);break;default:throw Error("Unhandled widget operation.");}b=W(a);(b=Gi(b).uiShown||null)&&b();}else b=sf(b,"Could not find the FirebaseUI widget element on the page."),f=new Fl(C("The browser you are using does not support Web Storage. Please try again in a different browser.").toString()),
    f.render(b),Y(a,f);b=a.g&&"blank"==a.g.Ga&&Bi(W(a));Ch(X(a))&&!b&&(b=Ch(X(a)),Bm(a,b.a),wh(rh,X(a)));}function An(a,b){if(a.A)return b(In(a));V(a,function(){a.A=!1;});if(di(W(a))){var c=new F(function(d){V(a,a.a.onAuthStateChanged(function(e){a.j=e;a.A||(a.A=!0,d(b(In(a))));}));});V(a,c);return c}a.A=!0;return b(null)}function In(a){Z(a);return di(W(a))&&a.j&&a.j.isAnonymous?a.j:null}function V(a,b){Z(a);if(b){a.s.push(b);var c=function(){Qa(a.s,function(d){return d==b});};"function"!=typeof b&&b.then(c,
    c);}}l.Cb=function(){Z(this);this.Z=!0;};function Jn(a){Z(a);var b;(b=a.Z)||(a=W(a),a=ri(a,index_cjs$3.auth.GoogleAuthProvider.PROVIDER_ID),b=!(!a||"select_account"!==a.prompt));return b}function Hl(a){"undefined"!==typeof a.a.languageCode&&a.Y&&(a.Y=!1,a.a.languageCode=a.u);}function Bm(a,b){a.a.tenantId=b;a.h.tenantId=b;}l.reset=function(){Z(this);var a=this;this.T&&this.T.removeAttribute("lang");this.J&&Ee(this.J);Hl(this);this.O=null;Hn();wh(rh,X(this));Z(this);this.l.cancel();this.i=G({user:null,credential:null});
    Cn==this&&(Cn=null);this.T=null;for(var b=0;b<this.s.length;b++)if("function"==typeof this.s[b])this.s[b]();else this.s[b].cancel&&this.s[b].cancel();this.s=[];Ah(X(this));this.g&&(this.g.o(),this.g=null);this.L=null;this.h&&(this.C=hm(this).then(function(){a.C=null;},function(){a.C=null;}));};function Gn(a,b){a.L=null;a.J=new Fe(b);a.J.register();le(a.J,"pageEnter",function(c){c=c&&c.pageId;if(a.L!=c){var d=W(a);(d=Gi(d).uiChanged||null)&&d(a.L,c);a.L=c;}});}l.ib=function(a){Z(this);var b=this.ca,c;for(c in a)try{Ih(b.a,
    c,a[c]);}catch(d){og('Invalid config: "'+c+'"',void 0);}gc&&Ih(b.a,"popupMode",!1);ui(b);!this.da&&Fi(W(this))&&(tg("signInSuccess callback is deprecated. Please use signInSuccessWithAuthResult callback instead."),this.da=!0);};function W(a){Z(a);return a.ca}l.Ub=function(){Z(this);var a=W(this),b=Jh(a.a,"widgetUrl");a=vi(a);var c=b.search(tb);for(var d=0,e,f=[];0<=(e=sb(b,d,a,c));)f.push(b.substring(d,e)),d=Math.min(b.indexOf("&",e)+1||c,c);f.push(b.substr(d));b=f.join("").replace(vb,"$1");c="="+encodeURIComponent("select");
    (a+=c)?(c=b.indexOf("#"),0>c&&(c=b.length),d=b.indexOf("?"),0>d||d>c?(d=c,e=""):e=b.substring(d+1,c),b=[b.substr(0,d),e,b.substr(c)],c=b[1],b[1]=a?c?c+"&"+a:a:c,c=b[0]+(b[1]?"?"+b[1]:"")+b[2]):c=b;W(this).a.get("popupMode")?(a=(window.screen.availHeight-600)/2,b=(window.screen.availWidth-500)/2,c=c||"about:blank",a={width:500,height:600,top:0<a?a:0,left:0<b?b:0,location:!0,resizable:!0,statusbar:!0,toolbar:!1},a.target=a.target||c.target||"google_popup",a.width=a.width||690,a.height=a.height||500,
    (a=pf(c,a))&&a.focus()):Oc(window.location,c);};function Z(a){if(a.$)throw Error("AuthUI instance is deleted!");}l.Wa=function(){var a=this;Z(this);return this.h.app.delete().then(function(){var b=xn(X(a));delete yn[b];a.reset();a.$=!0;})};function tn(a){Z(a);try{Qf(a.l,li(W(a)),Jn(a)).then(function(b){return a.g?Ql(a,a.g,b):!1});}catch(b){}}l.Gb=function(a,b){Z(this);var c=this,d=vf();if(!yi(W(this)))return df(Error("Email link sign-in should be enabled to trigger email sending."));var e=Ai(W(this)),
    f=new Qb(e.url);Rb(f,d);b&&b.a&&(Gh(d,b,X(this)),Ub(f,b.a.providerId));Sb(f,zi(W(this)));return An(this,function(g){g&&((g=g.uid)?f.a.a.set(x.Pa,g):Ob(f.a.a,x.Pa));e.url=f.toString();return U(c).sendSignInLinkToEmail(a,e)}).then(function(){var g=X(c),h={};h.email=a;xh(th,Yg(d,JSON.stringify(h)),g);},function(g){wh(uh,X(c));wh(th,X(c));throw g;})};function Cm(a,b){var c=Tb(new Qb(b));if(!c)return G(null);b=new F(function(d,e){var f=an(a).onAuthStateChanged(function(g){f();g&&g.isAnonymous&&g.uid===
    c?d(g):g&&g.isAnonymous&&g.uid!==c?e(Error("anonymous-user-mismatch")):e(Error("anonymous-user-not-found"));});V(a,f);});V(a,b);return b}function Gm(a,b,c,d,e){Z(a);var f=e||null,g=index_cjs$3.auth.EmailAuthProvider.credentialWithLink(c,d);c=f?U(a).signInWithEmailLink(c,d).then(function(h){return h.user.linkWithCredential(f)}).then(function(){return hm(a)}).then(function(){return Bn(a,{code:"auth/email-already-in-use"},f)}):U(a).fetchSignInMethodsForEmail(c).then(function(h){return h.length?Bn(a,{code:"auth/email-already-in-use"},
    g):b.linkWithCredential(g)});V(a,c);return c}function Hm(a,b,c,d){Z(a);var e=d||null,f;b=U(a).signInWithEmailLink(b,c).then(function(g){f={user:g.user,credential:null,operationType:g.operationType,additionalUserInfo:g.additionalUserInfo};if(e)return g.user.linkWithCredential(e).then(function(h){f={user:h.user,credential:e,operationType:f.operationType,additionalUserInfo:h.additionalUserInfo};})}).then(function(){hm(a);}).then(function(){return an(a).updateCurrentUser(f.user)}).then(function(){f.user=
    an(a).currentUser;return f});V(a,b);return b}function Hn(){var a=tf();if(Dn(a)){a=new Qb(a);for(var b in x)x.hasOwnProperty(b)&&Ob(a.a.a,x[b]);b={state:"signIn",mode:"emailLink",operation:"clear"};var c=n.document.title;n.history&&n.history.replaceState&&n.history.replaceState(b,c,a.toString());}}l.$b=function(a,b){Z(this);var c=this;return U(this).signInWithEmailAndPassword(a,b).then(function(d){return An(c,function(e){return e?hm(c).then(function(){return Bn(c,{code:"auth/email-already-in-use"},
    index_cjs$3.auth.EmailAuthProvider.credential(a,b))}):d})})};l.Wb=function(a,b){Z(this);var c=this;return An(this,function(d){if(d){var e=index_cjs$3.auth.EmailAuthProvider.credential(a,b);return d.linkWithCredential(e)}return U(c).createUserWithEmailAndPassword(a,b)})};l.Zb=function(a){Z(this);var b=this;return An(this,function(c){return c?c.linkWithCredential(a).then(function(d){return d},function(d){if(d&&"auth/email-already-in-use"==d.code&&d.email&&d.credential)throw d;return Bn(b,d,a)}):U(b).signInWithCredential(a)})};
    function Ol(a,b){Z(a);return An(a,function(c){return c&&!zh(X(a))?c.linkWithPopup(b).then(function(d){return d},function(d){if(d&&"auth/email-already-in-use"==d.code&&d.email&&d.credential)throw d;return Bn(a,d)}):U(a).signInWithPopup(b)})}l.bc=function(a){Z(this);var b=this,c=this.i;this.i=null;return An(this,function(d){return d&&!zh(X(b))?d.linkWithRedirect(a):U(b).signInWithRedirect(a)}).then(function(){},function(d){b.i=c;throw d;})};l.ac=function(a,b){Z(this);var c=this;return An(this,function(d){return d?
    d.linkWithPhoneNumber(a,b).then(function(e){return new Sf(e,function(f){if("auth/credential-already-in-use"==f.code)return Bn(c,f);throw f;})}):an(c).signInWithPhoneNumber(a,b).then(function(e){return new Sf(e)})})};l.Yb=function(){Z(this);return an(this).signInAnonymously()};function Jl(a,b){Z(a);return An(a,function(c){if(a.j&&!a.j.isAnonymous&&di(W(a))&&!U(a).currentUser)return hm(a).then(function(){"password"==b.credential.providerId&&(b.credential=null);return b});if(c)return hm(a).then(function(){return c.linkWithCredential(b.credential)}).then(function(d){b.user=
    d.user;b.credential=d.credential;b.operationType=d.operationType;b.additionalUserInfo=d.additionalUserInfo;return b},function(d){if(d&&"auth/email-already-in-use"==d.code&&d.email&&d.credential)throw d;return Bn(a,d,b.credential)});if(!b.user)throw Error('Internal error: An incompatible or outdated version of "firebase.js" may be used.');return hm(a).then(function(){return an(a).updateCurrentUser(b.user)}).then(function(){b.user=an(a).currentUser;b.operationType="signIn";b.credential&&b.credential.providerId&&
    "password"==b.credential.providerId&&(b.credential=null);return b})})}l.Vb=function(a,b){Z(this);return U(this).signInWithEmailAndPassword(a,b)};function hm(a){Z(a);return U(a).signOut()}function Bn(a,b,c){Z(a);if(b&&b.code&&("auth/email-already-in-use"==b.code||"auth/credential-already-in-use"==b.code)){var d=ei(W(a));return G().then(function(){return d(new Od("anonymous-upgrade-merge-conflict",null,c||b.credential))}).then(function(){a.g&&(a.g.o(),a.g=null);throw b;})}return df(b)}function Kn(a,
    b,c,d){P.call(this,el,void 0,d,"providerMatchByEmail",{F:b,D:c});this.i=a;}m(Kn,P);Kn.prototype.v=function(){this.u(this.i);this.w(this.i);this.l().focus();wm(this.l(),(this.l().value||"").length);P.prototype.v.call(this);};Kn.prototype.m=function(){this.i=null;P.prototype.m.call(this);};u(Kn.prototype,{l:ol,H:pl,u:ql,B:rl,j:sl,M:fl,w:hl});function Ln(a,b,c,d,e){P.call(this,dl,{cc:b},e,"selectTenant",{F:c,D:d});this.i=a;}m(Ln,P);Ln.prototype.v=function(){Mn(this,this.i);P.prototype.v.call(this);};Ln.prototype.m=
    function(){this.i=null;P.prototype.m.call(this);};function Mn(a,b){function c(h){b(h);}for(var d=a.g?Uc("firebaseui-id-tenant-selection-button",a.g||a.s.a):[],e=0;e<d.length;e++){var f=d[e],g=cn(f,"tenantId");O(a,f,za(c,g));}}function Nn(a){P.call(this,zk,void 0,a,"spinner");}m(Nn,P);function On(a){this.a=new Hh;I(this.a,"authDomain");I(this.a,"displayMode",Pn);I(this.a,"tenants");I(this.a,"callbacks");I(this.a,"tosUrl");I(this.a,"privacyPolicyUrl");for(var b in a)if(a.hasOwnProperty(b))try{Ih(this.a,
    b,a[b]);}catch(c){og('Invalid config: "'+b+'"',void 0);}}function Qn(a){a=a.a.get("displayMode");for(var b in Rn)if(Rn[b]===a)return Rn[b];return Pn}function Sn(a){return a.a.get("callbacks")||{}}function Tn(a){var b=a.a.get("tosUrl")||null;a=a.a.get("privacyPolicyUrl")||null;b&&!a&&tg("Privacy Policy URL is missing, the link will not be displayed.");if(b&&a){if("function"===typeof b)return b;if("string"===typeof b)return function(){rf(b);}}return null}function Un(a){var b=a.a.get("tosUrl")||null,c=
    a.a.get("privacyPolicyUrl")||null;c&&!b&&tg("Terms of Service URL is missing, the link will not be displayed.");if(b&&c){if("function"===typeof c)return c;if("string"===typeof c)return function(){rf(c);}}return null}function Vn(a,b){a=a.a.get("tenants");if(!a||!a.hasOwnProperty(b)&&!a.hasOwnProperty(Wn))throw Error("Invalid tenant configuration!");}function Xn(a,b,c){a=a.a.get("tenants");if(!a)throw Error("Invalid tenant configuration!");var d=[];a=a[b]||a[Wn];if(!a)return og("Invalid tenant configuration: "+
    (b+" is not configured!"),void 0),d;b=a.signInOptions;if(!b)throw Error("Invalid tenant configuration: signInOptions are invalid!");b.forEach(function(e){if("string"===typeof e)d.push(e);else if("string"===typeof e.provider){var f=e.hd;f&&c?(f instanceof RegExp?f:new RegExp("@"+f.replace(".","\\.")+"$")).test(c)&&d.push(e.provider):d.push(e.provider);}else e="Invalid tenant configuration: signInOption "+(JSON.stringify(e)+" is invalid!"),og(e,void 0);});return d}function Yn(a,b,c){a=Zn(a,b);(b=a.signInOptions)&&
    c&&(b=b.filter(function(d){return "string"===typeof d?c.includes(d):c.includes(d.provider)}),a.signInOptions=b);return a}function Zn(a,b){var c=$n;var d=void 0===d?{}:d;Vn(a,b);a=a.a.get("tenants");return wf(a[b]||a[Wn],c,d)}var $n=["immediateFederatedRedirect","privacyPolicyUrl","signInFlow","signInOptions","tosUrl"],Pn="optionFirst",Rn={nc:Pn,mc:"identifierFirst"},Wn="*";function ao(a,b){var c=this;this.s=sf(a);this.a={};Object.keys(b).forEach(function(d){c.a[d]=new On(b[d]);});this.ob=this.g=this.A=
    this.h=this.i=this.j=null;Object.defineProperty(this,"languageCode",{get:function(){return this.ob},set:function(d){this.ob=d||null;},enumerable:!1});}l=ao.prototype;l.Sb=function(a,b){var c=this;bo(this);var d=a.apiKey;return new F(function(e,f){if(c.a.hasOwnProperty(d)){var g=Sn(c.a[d]).selectTenantUiHidden||null;if(Qn(c.a[d])===Pn){var h=[];b.forEach(function(r){r=r||"_";var H=c.a[d].a.get("tenants");if(!H)throw Error("Invalid tenant configuration!");(H=H[r]||H[Wn])?r={tenantId:"_"!==r?r:null,V:H.fullLabel||
    null,displayName:H.displayName,za:H.iconUrl,ta:H.buttonColor}:(og("Invalid tenant configuration: "+(r+" is not configured!"),void 0),r=null);r&&h.push(r);});var k=function(r){r={tenantId:r,providerIds:Xn(c.a[d],r||"_")};e(r);};if(1===h.length){k(h[0].tenantId);return}c.g=new Ln(function(r){bo(c);g&&g();k(r);},h,Tn(c.a[d]),Un(c.a[d]));}else c.g=new Kn(function(){var r=c.g.j();if(r){for(var H=0;H<b.length;H++){var Ba=Xn(c.a[d],b[H]||"_",r);if(0!==Ba.length){r={tenantId:b[H],providerIds:Ba,email:r};bo(c);
    g&&g();e(r);return}}c.g.a(Md({code:"no-matching-tenant-for-email"}).toString());}},Tn(c.a[d]),Un(c.a[d]));c.g.render(c.s);(f=Sn(c.a[d]).selectTenantUiShown||null)&&f();}else {var p=Error("Invalid project configuration: API key is invalid!");p.code="invalid-configuration";c.pb(p);f(p);}})};l.Nb=function(a,b){if(!this.a.hasOwnProperty(a))throw Error("Invalid project configuration: API key is invalid!");var c=b||void 0;Vn(this.a[a],b||"_");try{this.i=index_cjs$3.app(c).auth();}catch(e){var d=this.a[a].a.get("authDomain");
    if(!d)throw Error("Invalid project configuration: authDomain is required!");a=index_cjs$3.initializeApp({apiKey:a,authDomain:d},c);a.auth().tenantId=b;this.i=a.auth();}return this.i};l.Xb=function(a,b){var c=this;return new F(function(d,e){function f(H,Ba){c.j=new wn(a);En(c.j,c.s,H,Ba);}var g=a.app.options.apiKey;c.a.hasOwnProperty(g)||e(Error("Invalid project configuration: API key is invalid!"));var h=Yn(c.a[g],a.tenantId||"_",b&&b.providerIds);bo(c);e={signInSuccessWithAuthResult:function(H){d(H);
    return !1}};var k=Sn(c.a[g]).signInUiShown||null,p=!1;e.uiChanged=function(H,Ba){null===H&&"callback"===Ba?((H=Wc("firebaseui-id-page-callback",c.s))&&Kj(H),c.h=new Nn,c.h.render(c.s)):p||null===H&&"spinner"===Ba||"blank"===Ba||(c.h&&(c.h.o(),c.h=null),p=!0,k&&k(a.tenantId));};h.callbacks=e;h.credentialHelper="none";var r;b&&b.email&&(r={emailHint:b.email});c.j?c.j.Wa().then(function(){f(h,r);}):f(h,r);})};l.reset=function(){var a=this;return G().then(function(){a.j&&a.j.Wa();}).then(function(){a.j=null;
    bo(a);})};l.Tb=function(){var a=this;this.h||this.A||(this.A=window.setTimeout(function(){bo(a);a.h=new Nn;a.g=a.h;a.h.render(a.s);a.A=null;},500));};l.mb=function(){window.clearTimeout(this.A);this.A=null;this.h&&(this.h.o(),this.h=null);};l.Ab=function(){bo(this);this.g=new Al;this.g.render(this.s);return G()};function bo(a){a.j&&a.j.reset();a.mb();a.g&&a.g.o();}l.pb=function(a){var b=this,c=Md({code:a.code}).toString()||a.message;bo(this);var d;a.retry&&"function"===typeof a.retry&&(d=function(){b.reset();
    a.retry();});this.g=new El(c,d);this.g.render(this.s);};l.Pb=function(a){var b=this;return G().then(function(){var c=b.i&&b.i.app.options.apiKey;if(!b.a.hasOwnProperty(c))throw Error("Invalid project configuration: API key is invalid!");Vn(b.a[c],a.tenantId||"_");if(!b.i.currentUser||b.i.currentUser.uid!==a.uid)throw Error("The user being processed does not match the signed in user!");return (c=Sn(b.a[c]).beforeSignInSuccess||null)?c(a):a}).then(function(c){if(c.uid!==a.uid)throw Error("User with mismatching UID returned.");
    return c})};v("firebaseui.auth.FirebaseUiHandler",ao);v("firebaseui.auth.FirebaseUiHandler.prototype.selectTenant",ao.prototype.Sb);v("firebaseui.auth.FirebaseUiHandler.prototype.getAuth",ao.prototype.Nb);v("firebaseui.auth.FirebaseUiHandler.prototype.startSignIn",ao.prototype.Xb);v("firebaseui.auth.FirebaseUiHandler.prototype.reset",ao.prototype.reset);v("firebaseui.auth.FirebaseUiHandler.prototype.showProgressBar",ao.prototype.Tb);v("firebaseui.auth.FirebaseUiHandler.prototype.hideProgressBar",
    ao.prototype.mb);v("firebaseui.auth.FirebaseUiHandler.prototype.completeSignOut",ao.prototype.Ab);v("firebaseui.auth.FirebaseUiHandler.prototype.handleError",ao.prototype.pb);v("firebaseui.auth.FirebaseUiHandler.prototype.processUser",ao.prototype.Pb);v("firebaseui.auth.AuthUI",wn);v("firebaseui.auth.AuthUI.getInstance",function(a){a=xn(a);return yn[a]?yn[a]:null});v("firebaseui.auth.AuthUI.prototype.disableAutoSignIn",wn.prototype.Cb);v("firebaseui.auth.AuthUI.prototype.start",wn.prototype.start);
    v("firebaseui.auth.AuthUI.prototype.setConfig",wn.prototype.ib);v("firebaseui.auth.AuthUI.prototype.signIn",wn.prototype.Ub);v("firebaseui.auth.AuthUI.prototype.reset",wn.prototype.reset);v("firebaseui.auth.AuthUI.prototype.delete",wn.prototype.Wa);v("firebaseui.auth.AuthUI.prototype.isPendingRedirect",wn.prototype.nb);v("firebaseui.auth.AuthUIError",Od);v("firebaseui.auth.AuthUIError.prototype.toJSON",Od.prototype.toJSON);v("firebaseui.auth.CredentialHelper.ACCOUNT_CHOOSER_COM",Ii);v("firebaseui.auth.CredentialHelper.GOOGLE_YOLO",
    ni);v("firebaseui.auth.CredentialHelper.NONE",ci);v("firebaseui.auth.AnonymousAuthProvider.PROVIDER_ID","anonymous");F.prototype["catch"]=F.prototype.Ca;F.prototype["finally"]=F.prototype.dc;}).apply(typeof global!=="undefined"?global:typeof self!=="undefined"?self:window);}).apply(typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : window );if(typeof window!=='undefined'){window.dialogPolyfill=dialogPolyfill;}const auth = firebaseui.auth;

    var firebaseui$1 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        auth: auth
    });

    /* src/component/Auth.svelte generated by Svelte v3.29.0 */

    const { console: console_1 } = globals;
    const file$3 = "src/component/Auth.svelte";

    function create_fragment$5(ctx) {
    	let div;
    	let t0;
    	let a;
    	let t1;
    	let a_href_value;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t0 = space();
    			a = element("a");
    			t1 = text(/*authLabel*/ ctx[0]);
    			attr_dev(div, "id", "firebaseui-auth-container");
    			add_location(div, file$3, 63, 0, 2294);
    			attr_dev(a, "href", a_href_value = "#");
    			add_location(a, file$3, 64, 0, 2337);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, a, anchor);
    			append_dev(a, t1);

    			if (!mounted) {
    				dispose = listen_dev(a, "click", /*onClick*/ ctx[1], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*authLabel*/ 1) set_data_dev(t1, /*authLabel*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(a);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Auth", slots, []);

    	var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
    		function adopt(value) {
    			return value instanceof P
    			? value
    			: new P(function (resolve) {
    						resolve(value);
    					});
    		}

    		return new (P || (P = Promise))(function (resolve, reject) {
    				function fulfilled(value) {
    					try {
    						step(generator.next(value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function rejected(value) {
    					try {
    						step(generator["throw"](value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function step(result) {
    					result.done
    					? resolve(result.value)
    					: adopt(result.value).then(fulfilled, rejected);
    				}

    				step((generator = generator.apply(thisArg, _arguments || [])).next());
    			});
    	};

    	
    	let { user = null } = $$props;
    	let authLabel = "ログイン";
    	let authUi = null;
    	const dispatch = createEventDispatcher();

    	const firebaseConfig = {
    		apiKey: "AIzaSyCKxOAhXymGjUrtiodvue3xL7WA16qd9cc",
    		authDomain: "rss-feed-proxy.firebaseapp.com",
    		projectId: "rss-feed-proxy",
    		appId: "1:1090474250814:web:6a5631b43bc8b5e13d376f"
    	};

    	const uiConfig = {
    		signInSuccessUrl: `${location.origin}/`,
    		signInOptions: [index_cjs$3.auth.EmailAuthProvider.PROVIDER_ID],
    		tosUrl: "#",
    		privacyPolicyUrl: "#"
    	};

    	const onAuthStateChanged = authUser => {
    		if (authUser) {
    			console.log(authUser);

    			if (!user || authUser.uid !== user.id) {
    				$$invalidate(0, authLabel = "ログアウト");

    				$$invalidate(2, user = {
    					id: authUser.uid,
    					name: authUser.email,
    					email: authUser.email
    				});

    				dispatch("exec", { payload: "login" });
    			}
    		} else {
    			if (user) {
    				$$invalidate(0, authLabel = "ログイン");
    				$$invalidate(2, user = null);
    				dispatch("exec", { payload: "logout" });
    			}
    		}
    	};

    	onMount(() => __awaiter(void 0, void 0, void 0, function* () {
    		index_cjs$3.initializeApp(firebaseConfig);

    		index_cjs$3.auth().onAuthStateChanged(onAuthStateChanged, e => {
    			console.log(e);
    		});

    		authUi = new auth.AuthUI(index_cjs$3.auth());
    	}));

    	const onClick = () => {
    		if (user) index_cjs$3.auth().signOut(); else authUi.start("#firebaseui-auth-container", uiConfig);
    	};

    	const writable_props = ["user"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Auth> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("user" in $$props) $$invalidate(2, user = $$props.user);
    	};

    	$$self.$capture_state = () => ({
    		__awaiter,
    		onMount,
    		onDestroy,
    		createEventDispatcher,
    		firebase,
    		firebaseui: firebaseui$1,
    		user,
    		authLabel,
    		authUi,
    		dispatch,
    		firebaseConfig,
    		uiConfig,
    		onAuthStateChanged,
    		onClick
    	});

    	$$self.$inject_state = $$props => {
    		if ("__awaiter" in $$props) __awaiter = $$props.__awaiter;
    		if ("user" in $$props) $$invalidate(2, user = $$props.user);
    		if ("authLabel" in $$props) $$invalidate(0, authLabel = $$props.authLabel);
    		if ("authUi" in $$props) authUi = $$props.authUi;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [authLabel, onClick, user];
    }

    class Auth extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { user: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Auth",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get user() {
    		throw new Error("<Auth>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set user(value) {
    		throw new Error("<Auth>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/component/Header.svelte generated by Svelte v3.29.0 */
    const file$4 = "src/component/Header.svelte";
    const get_auth_slot_changes = dirty => ({});
    const get_auth_slot_context = ctx => ({});

    // (11:6) {#if user}
    function create_if_block$3(ctx) {
    	let router;
    	let current;

    	router = new Router({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(11:6) {#if user}",
    		ctx
    	});

    	return block;
    }

    // (13:8) <Link to="/">
    function create_default_slot_2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Feedリスト");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(13:8) <Link to=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (14:8) <Link to="/feed-info">
    function create_default_slot_1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Feed設定");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(14:8) <Link to=\\\"/feed-info\\\">",
    		ctx
    	});

    	return block;
    }

    // (12:6) <Router>
    function create_default_slot(ctx) {
    	let link0;
    	let t;
    	let link1;
    	let current;

    	link0 = new Link({
    			props: {
    				to: "/",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link1 = new Link({
    			props: {
    				to: "/feed-info",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(link1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(12:6) <Router>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let header;
    	let div;
    	let img;
    	let img_src_value;
    	let t0;
    	let nav;
    	let t1;
    	let current;
    	let if_block = /*user*/ ctx[0] && create_if_block$3(ctx);
    	const auth_slot_template = /*#slots*/ ctx[1].auth;
    	const auth_slot = create_slot(auth_slot_template, ctx, /*$$scope*/ ctx[2], get_auth_slot_context);

    	const block = {
    		c: function create() {
    			header = element("header");
    			div = element("div");
    			img = element("img");
    			t0 = space();
    			nav = element("nav");
    			if (if_block) if_block.c();
    			t1 = space();
    			if (auth_slot) auth_slot.c();
    			attr_dev(img, "class", "logo svelte-1nbu6fm");
    			if (img.src !== (img_src_value = "favicon.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "brand");
    			add_location(img, file$4, 7, 4, 165);
    			attr_dev(nav, "class", "nav svelte-1nbu6fm");
    			add_location(nav, file$4, 9, 4, 221);
    			attr_dev(div, "class", "site-header__wrapper svelte-1nbu6fm");
    			add_location(div, file$4, 6, 2, 126);
    			attr_dev(header, "class", "site-header svelte-1nbu6fm");
    			add_location(header, file$4, 5, 0, 95);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, div);
    			append_dev(div, img);
    			append_dev(div, t0);
    			append_dev(div, nav);
    			if (if_block) if_block.m(nav, null);
    			append_dev(nav, t1);

    			if (auth_slot) {
    				auth_slot.m(nav, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*user*/ ctx[0]) {
    				if (if_block) {
    					if (dirty & /*user*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(nav, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (auth_slot) {
    				if (auth_slot.p && dirty & /*$$scope*/ 4) {
    					update_slot(auth_slot, auth_slot_template, ctx, /*$$scope*/ ctx[2], dirty, get_auth_slot_changes, get_auth_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(auth_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(auth_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			if (if_block) if_block.d();
    			if (auth_slot) auth_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Header", slots, ['auth']);
    	let { user = null } = $$props;
    	const writable_props = ["user"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("user" in $$props) $$invalidate(0, user = $$props.user);
    		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ Router, Link, user });

    	$$self.$inject_state = $$props => {
    		if ("user" in $$props) $$invalidate(0, user = $$props.user);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [user, slots, $$scope];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { user: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get user() {
    		throw new Error("<Header>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set user(value) {
    		throw new Error("<Header>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/component/App.svelte generated by Svelte v3.29.0 */
    const file$5 = "src/component/App.svelte";

    // (49:2) <span slot="auth">
    function create_auth_slot(ctx) {
    	let span;
    	let auth;
    	let updating_user;
    	let current;

    	function auth_user_binding(value) {
    		/*auth_user_binding*/ ctx[4].call(null, value);
    	}

    	let auth_props = {};

    	if (/*user*/ ctx[0] !== void 0) {
    		auth_props.user = /*user*/ ctx[0];
    	}

    	auth = new Auth({ props: auth_props, $$inline: true });
    	binding_callbacks.push(() => bind(auth, "user", auth_user_binding));
    	auth.$on("exec", /*onExec*/ ctx[3]);

    	const block = {
    		c: function create() {
    			span = element("span");
    			create_component(auth.$$.fragment);
    			attr_dev(span, "slot", "auth");
    			add_location(span, file$5, 48, 2, 1841);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			mount_component(auth, span, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const auth_changes = {};

    			if (!updating_user && dirty & /*user*/ 1) {
    				updating_user = true;
    				auth_changes.user = /*user*/ ctx[0];
    				add_flush_callback(() => updating_user = false);
    			}

    			auth.$set(auth_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(auth.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(auth.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    			destroy_component(auth);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_auth_slot.name,
    		type: "slot",
    		source: "(49:2) <span slot=\\\"auth\\\">",
    		ctx
    	});

    	return block;
    }

    // (55:2) {#if user}
    function create_if_block$4(ctx) {
    	let h1;
    	let t0;
    	let t1_value = /*user*/ ctx[0].name + "";
    	let t1;
    	let t2;
    	let t3;
    	let router;
    	let current;

    	router = new Router({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t0 = text("Hello ");
    			t1 = text(t1_value);
    			t2 = text("!");
    			t3 = space();
    			create_component(router.$$.fragment);
    			add_location(h1, file$5, 55, 1, 1950);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			insert_dev(target, t3, anchor);
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty & /*user*/ 1) && t1_value !== (t1_value = /*user*/ ctx[0].name + "")) set_data_dev(t1, t1_value);
    			const router_changes = {};

    			if (dirty & /*$$scope, feedInfos, feeds*/ 134) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t3);
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(55:2) {#if user}",
    		ctx
    	});

    	return block;
    }

    // (59:4) <Route path="/">
    function create_default_slot_2$1(ctx) {
    	let feedlist;
    	let current;

    	feedlist = new FeedList({
    			props: { feeds: /*feeds*/ ctx[2] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(feedlist.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(feedlist, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const feedlist_changes = {};
    			if (dirty & /*feeds*/ 4) feedlist_changes.feeds = /*feeds*/ ctx[2];
    			feedlist.$set(feedlist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(feedlist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(feedlist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(feedlist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$1.name,
    		type: "slot",
    		source: "(59:4) <Route path=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (62:4) <Route path="/feed-info">
    function create_default_slot_1$1(ctx) {
    	let feedinfo;
    	let updating_feedInfos;
    	let current;

    	function feedinfo_feedInfos_binding(value) {
    		/*feedinfo_feedInfos_binding*/ ctx[5].call(null, value);
    	}

    	let feedinfo_props = {};

    	if (/*feedInfos*/ ctx[1] !== void 0) {
    		feedinfo_props.feedInfos = /*feedInfos*/ ctx[1];
    	}

    	feedinfo = new FeedInfo({ props: feedinfo_props, $$inline: true });
    	binding_callbacks.push(() => bind(feedinfo, "feedInfos", feedinfo_feedInfos_binding));
    	feedinfo.$on("exec", /*onExec*/ ctx[3]);

    	const block = {
    		c: function create() {
    			create_component(feedinfo.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(feedinfo, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const feedinfo_changes = {};

    			if (!updating_feedInfos && dirty & /*feedInfos*/ 2) {
    				updating_feedInfos = true;
    				feedinfo_changes.feedInfos = /*feedInfos*/ ctx[1];
    				add_flush_callback(() => updating_feedInfos = false);
    			}

    			feedinfo.$set(feedinfo_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(feedinfo.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(feedinfo.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(feedinfo, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$1.name,
    		type: "slot",
    		source: "(62:4) <Route path=\\\"/feed-info\\\">",
    		ctx
    	});

    	return block;
    }

    // (58:2) <Router>
    function create_default_slot$1(ctx) {
    	let route0;
    	let t;
    	let route1;
    	let current;

    	route0 = new Route({
    			props: {
    				path: "/",
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route1 = new Route({
    			props: {
    				path: "/feed-info",
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(route0.$$.fragment);
    			t = space();
    			create_component(route1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(route0, target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(route1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const route0_changes = {};

    			if (dirty & /*$$scope, feeds*/ 132) {
    				route0_changes.$$scope = { dirty, ctx };
    			}

    			route0.$set(route0_changes);
    			const route1_changes = {};

    			if (dirty & /*$$scope, feedInfos*/ 130) {
    				route1_changes.$$scope = { dirty, ctx };
    			}

    			route1.$set(route1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(route0, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(route1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(58:2) <Router>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let header;
    	let t0;
    	let main;
    	let t1;
    	let link0;
    	let link1;
    	let current;

    	header = new Header({
    			props: {
    				user: /*user*/ ctx[0],
    				$$slots: { auth: [create_auth_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	let if_block = /*user*/ ctx[0] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			create_component(header.$$.fragment);
    			t0 = space();
    			main = element("main");
    			if (if_block) if_block.c();
    			t1 = space();
    			link0 = element("link");
    			link1 = element("link");
    			add_location(main, file$5, 53, 0, 1929);
    			attr_dev(link0, "rel", "stylesheet");
    			attr_dev(link0, "href", "https://unpkg.com/sakura.css/css/sakura.css");
    			add_location(link0, file$5, 69, 1, 2207);
    			attr_dev(link1, "type", "text/css");
    			attr_dev(link1, "rel", "stylesheet");
    			attr_dev(link1, "href", "https://cdn.firebase.com/libs/firebaseui/3.5.2/firebaseui.css");
    			add_location(link1, file$5, 78, 2, 2666);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(header, target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			if (if_block) if_block.m(main, null);
    			insert_dev(target, t1, anchor);
    			append_dev(document.head, link0);
    			append_dev(document.head, link1);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const header_changes = {};
    			if (dirty & /*user*/ 1) header_changes.user = /*user*/ ctx[0];

    			if (dirty & /*$$scope, user*/ 129) {
    				header_changes.$$scope = { dirty, ctx };
    			}

    			header.$set(header_changes);

    			if (/*user*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*user*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(main, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(header, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (if_block) if_block.d();
    			if (detaching) detach_dev(t1);
    			detach_dev(link0);
    			detach_dev(link1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);

    	var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
    		function adopt(value) {
    			return value instanceof P
    			? value
    			: new P(function (resolve) {
    						resolve(value);
    					});
    		}

    		return new (P || (P = Promise))(function (resolve, reject) {
    				function fulfilled(value) {
    					try {
    						step(generator.next(value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function rejected(value) {
    					try {
    						step(generator["throw"](value));
    					} catch(e) {
    						reject(e);
    					}
    				}

    				function step(result) {
    					result.done
    					? resolve(result.value)
    					: adopt(result.value).then(fulfilled, rejected);
    				}

    				step((generator = generator.apply(thisArg, _arguments || [])).next());
    			});
    	};

    	
    	
    	let user = null;
    	let feedInfos = [];
    	let feeds = [];

    	onMount(() => __awaiter(void 0, void 0, void 0, function* () {
    		$$invalidate(2, feeds = yield getFeeds(feedInfos));
    	}));

    	const onExec = e => __awaiter(void 0, void 0, void 0, function* () {
    		switch (e.detail.payload) {
    			case "confirm":
    				yield putFeedInfos(user.id, feedInfos);
    				$$invalidate(2, feeds = yield getFeeds(feedInfos));
    				break;
    			case "getFeedInfos":
    				$$invalidate(1, feedInfos = yield getFeedInfos(user.id));
    				break;
    			case "login":
    				$$invalidate(1, feedInfos = yield getFeedInfos(user.id));
    				$$invalidate(2, feeds = yield getFeeds(feedInfos));
    				break;
    			case "logout":
    				$$invalidate(1, feedInfos = []);
    				$$invalidate(2, feeds = []);
    				break;
    		}
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function auth_user_binding(value) {
    		user = value;
    		$$invalidate(0, user);
    	}

    	function feedinfo_feedInfos_binding(value) {
    		feedInfos = value;
    		$$invalidate(1, feedInfos);
    	}

    	$$self.$capture_state = () => ({
    		__awaiter,
    		onMount,
    		Router,
    		Route,
    		getFeeds,
    		putFeedInfos,
    		getFeedInfos,
    		FeedInfo,
    		FeedList,
    		Auth,
    		Header,
    		user,
    		feedInfos,
    		feeds,
    		onExec
    	});

    	$$self.$inject_state = $$props => {
    		if ("__awaiter" in $$props) __awaiter = $$props.__awaiter;
    		if ("user" in $$props) $$invalidate(0, user = $$props.user);
    		if ("feedInfos" in $$props) $$invalidate(1, feedInfos = $$props.feedInfos);
    		if ("feeds" in $$props) $$invalidate(2, feeds = $$props.feeds);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [user, feedInfos, feeds, onExec, auth_user_binding, feedinfo_feedInfos_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
