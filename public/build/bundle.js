
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
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

    const api = async (query) => {
        const url = `${location.origin}/rss-feed/`;
        const inputRow = `${url}${query}`;
        const input = encodeURI(inputRow);
        const response = await fetch(input);
        return response;
    };
    const getFeed = async (rssUrl) => {
        const response = await api(`?url=${rssUrl}`);
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
    const getFeeds = async (feedUrls) => {
        const promises = feedUrls.map((feedUrl) => getFeed(feedUrl));
        const feeds = await Promise.all(promises);
        return feeds;
    };

    /* src/component/FeedInfo.svelte generated by Svelte v3.29.0 */
    const file = "src/component/FeedInfo.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	child_ctx[11] = list;
    	child_ctx[12] = i;
    	return child_ctx;
    }

    // (71:4) {:else}
    function create_else_block(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "×";
    			add_location(span, file, 71, 4, 2252);
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
    		id: create_else_block.name,
    		type: "else",
    		source: "(71:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (69:4) {#if valids[i]}
    function create_if_block(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "○";
    			add_location(span, file, 69, 4, 2221);
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
    		id: create_if_block.name,
    		type: "if",
    		source: "(69:4) {#if valids[i]}",
    		ctx
    	});

    	return block;
    }

    // (65:2) {#each feedUrls as feedUrl, i}
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
    		/*input0_input_handler*/ ctx[5].call(input0, /*each_value*/ ctx[11], /*i*/ ctx[12]);
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*valids*/ ctx[1][/*i*/ ctx[12]]) return create_if_block;
    		return create_else_block;
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
    			attr_dev(input0, "name", input0_name_value = /*i*/ ctx[12]);
    			input0.required = true;
    			add_location(input0, file, 66, 4, 2138);
    			attr_dev(input1, "type", "button");
    			attr_dev(input1, "name", input1_name_value = /*i*/ ctx[12]);
    			input1.value = "削除";
    			add_location(input1, file, 74, 4, 2282);
    			attr_dev(div, "class", "feed-url svelte-sqtt3s");
    			add_location(div, file, 65, 2, 2111);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, input0);
    			set_input_value(input0, /*feedUrl*/ ctx[10]);
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

    			if (dirty & /*feedUrls*/ 1) {
    				set_input_value(input0, /*feedUrl*/ ctx[10]);
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
    		source: "(65:2) {#each feedUrls as feedUrl, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let form;
    	let t0;
    	let div;
    	let input0;
    	let t1;
    	let input1;
    	let mounted;
    	let dispose;
    	let each_value = /*feedUrls*/ ctx[0];
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
    			attr_dev(input0, "type", "button");
    			attr_dev(input0, "class", "nav-item svelte-sqtt3s");
    			input0.value = "追加";
    			add_location(input0, file, 79, 4, 2386);
    			attr_dev(input1, "type", "button");
    			attr_dev(input1, "class", "nav-item svelte-sqtt3s");
    			input1.value = "確定";
    			add_location(input1, file, 80, 4, 2455);
    			attr_dev(div, "class", "nav svelte-sqtt3s");
    			add_location(div, file, 78, 2, 2364);
    			add_location(form, file, 63, 0, 2069);
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

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "click", /*add*/ ctx[2], false, false, false),
    					listen_dev(input1, "click", /*confirm*/ ctx[4], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*remove, valids, feedUrls*/ 11) {
    				each_value = /*feedUrls*/ ctx[0];
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
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
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

    	
    	let { feedUrls = [] } = $$props;
    	let valids = feedUrls.map(() => true);
    	const dispatch = createEventDispatcher();

    	const add = () => {
    		$$invalidate(0, feedUrls = [...feedUrls, ""]);
    		$$invalidate(1, valids = [...valids, true]);
    	};

    	const remove = e => {
    		const removeIndex = parseInt(e.target.name, 10);
    		$$invalidate(0, feedUrls = feedUrls.filter((_, index) => index !== removeIndex));
    		$$invalidate(1, valids = valids.filter((_, index) => index !== removeIndex));
    	};

    	const checkValidation = feedUrls => __awaiter(void 0, void 0, void 0, function* () {
    		const feeds = yield getFeeds(feedUrls);
    		$$invalidate(1, valids = feeds.map(feed => feed.ok));
    	});

    	const isAllValid = () => {
    		return !valids.includes(false);
    	};

    	const confirm = () => __awaiter(void 0, void 0, void 0, function* () {
    		yield checkValidation(feedUrls);

    		if (isAllValid()) {
    			dispatch("exec", { payload: "confirm" });
    		} else {
    			alert("不適切なURLがあります。");
    		}
    	});

    	onMount(() => __awaiter(void 0, void 0, void 0, function* () {
    		yield checkValidation(feedUrls);
    	}));

    	const writable_props = ["feedUrls"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<FeedInfo> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler(each_value, i) {
    		each_value[i] = this.value;
    		$$invalidate(0, feedUrls);
    	}

    	$$self.$$set = $$props => {
    		if ("feedUrls" in $$props) $$invalidate(0, feedUrls = $$props.feedUrls);
    	};

    	$$self.$capture_state = () => ({
    		__awaiter,
    		onMount,
    		createEventDispatcher,
    		getFeeds,
    		feedUrls,
    		valids,
    		dispatch,
    		add,
    		remove,
    		checkValidation,
    		isAllValid,
    		confirm
    	});

    	$$self.$inject_state = $$props => {
    		if ("__awaiter" in $$props) __awaiter = $$props.__awaiter;
    		if ("feedUrls" in $$props) $$invalidate(0, feedUrls = $$props.feedUrls);
    		if ("valids" in $$props) $$invalidate(1, valids = $$props.valids);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [feedUrls, valids, add, remove, confirm, input0_input_handler];
    }

    class FeedInfo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { feedUrls: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FeedInfo",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get feedUrls() {
    		throw new Error("<FeedInfo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set feedUrls(value) {
    		throw new Error("<FeedInfo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/component/FeedList.svelte generated by Svelte v3.29.0 */

    const { Object: Object_1 } = globals;
    const file$1 = "src/component/FeedList.svelte";

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
    function create_else_block$1(ctx) {
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
    			add_location(a, file$1, 58, 5, 1203);
    			add_location(p, file$1, 58, 2, 1200);
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
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(58:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (39:2) {#if feed.ok}
    function create_if_block$1(ctx) {
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
    	let if_block = /*feed*/ ctx[3].description && create_if_block_1(ctx);
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

    			add_location(summary, file$1, 40, 4, 764);
    			attr_dev(a0, "href", a0_href_value = /*feed*/ ctx[3].link);
    			add_location(a0, file$1, 42, 4, 801);
    			attr_dev(a1, "href", a1_href_value = /*feed*/ ctx[3].url);
    			add_location(a1, file$1, 43, 4, 836);
    			add_location(details, file$1, 39, 2, 750);
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
    					if_block = create_if_block_1(ctx);
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
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(39:2) {#if feed.ok}",
    		ctx
    	});

    	return block;
    }

    // (46:4) {#if feed.description}
    function create_if_block_1(ctx) {
    	let p;
    	let t_value = /*feed*/ ctx[3].description + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			add_location(p, file$1, 46, 4, 900);
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
    		id: create_if_block_1.name,
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
    			add_location(a, file$1, 51, 36, 1036);
    			attr_dev(p0, "class", "content-item title svelte-fhl34u");
    			add_location(p0, file$1, 51, 6, 1006);
    			attr_dev(p1, "class", "date svelte-fhl34u");
    			add_location(p1, file$1, 52, 6, 1089);
    			attr_dev(div, "class", "content svelte-fhl34u");
    			add_location(div, file$1, 50, 4, 978);
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
    		if (/*feed*/ ctx[3].ok) return create_if_block$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			form = element("form");
    			if_block.c();
    			t = space();
    			add_location(form, file$1, 37, 0, 725);
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

    function create_fragment$1(ctx) {
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
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { feeds: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FeedList",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get feeds() {
    		throw new Error("<FeedList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set feeds(value) {
    		throw new Error("<FeedList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/component/App.svelte generated by Svelte v3.29.0 */
    const file$2 = "src/component/App.svelte";

    function create_fragment$2(ctx) {
    	let link;
    	let t0;
    	let main;
    	let h1;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let p;
    	let t5;
    	let a;
    	let t7;
    	let t8;
    	let feedinfo;
    	let updating_feedUrls;
    	let t9;
    	let feedlist;
    	let current;

    	function feedinfo_feedUrls_binding(value) {
    		/*feedinfo_feedUrls_binding*/ ctx[4].call(null, value);
    	}

    	let feedinfo_props = {};

    	if (/*feedUrls*/ ctx[1] !== void 0) {
    		feedinfo_props.feedUrls = /*feedUrls*/ ctx[1];
    	}

    	feedinfo = new FeedInfo({ props: feedinfo_props, $$inline: true });
    	binding_callbacks.push(() => bind(feedinfo, "feedUrls", feedinfo_feedUrls_binding));
    	feedinfo.$on("exec", /*onExec*/ ctx[3]);

    	feedlist = new FeedList({
    			props: { feeds: /*feeds*/ ctx[2] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			link = element("link");
    			t0 = space();
    			main = element("main");
    			h1 = element("h1");
    			t1 = text("Hello ");
    			t2 = text(/*name*/ ctx[0]);
    			t3 = text("!");
    			t4 = space();
    			p = element("p");
    			t5 = text("Visit the ");
    			a = element("a");
    			a.textContent = "Svelte tutorial";
    			t7 = text(" to learn how to build Svelte apps.");
    			t8 = space();
    			create_component(feedinfo.$$.fragment);
    			t9 = space();
    			create_component(feedlist.$$.fragment);
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "href", "https://unpkg.com/sakura.css/css/sakura.css");
    			add_location(link, file$2, 40, 1, 1489);
    			attr_dev(h1, "class", "svelte-1tky8bj");
    			add_location(h1, file$2, 51, 1, 1969);
    			attr_dev(a, "href", "https://svelte.dev/tutorial");
    			add_location(a, file$2, 52, 14, 2006);
    			add_location(p, file$2, 52, 1, 1993);
    			attr_dev(main, "class", "svelte-1tky8bj");
    			add_location(main, file$2, 50, 0, 1961);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			append_dev(document.head, link);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, h1);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			append_dev(h1, t3);
    			append_dev(main, t4);
    			append_dev(main, p);
    			append_dev(p, t5);
    			append_dev(p, a);
    			append_dev(p, t7);
    			append_dev(main, t8);
    			mount_component(feedinfo, main, null);
    			append_dev(main, t9);
    			mount_component(feedlist, main, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*name*/ 1) set_data_dev(t2, /*name*/ ctx[0]);
    			const feedinfo_changes = {};

    			if (!updating_feedUrls && dirty & /*feedUrls*/ 2) {
    				updating_feedUrls = true;
    				feedinfo_changes.feedUrls = /*feedUrls*/ ctx[1];
    				add_flush_callback(() => updating_feedUrls = false);
    			}

    			feedinfo.$set(feedinfo_changes);
    			const feedlist_changes = {};
    			if (dirty & /*feeds*/ 4) feedlist_changes.feeds = /*feeds*/ ctx[2];
    			feedlist.$set(feedlist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(feedinfo.$$.fragment, local);
    			transition_in(feedlist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(feedinfo.$$.fragment, local);
    			transition_out(feedlist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			detach_dev(link);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			destroy_component(feedinfo);
    			destroy_component(feedlist);
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

    	
    	let { name } = $$props;

    	let feedUrls = [
    		"https://qiita.com/tags/svelte/feed",
    		"https://news.yahoo.co.jp/pickup/rss.xml",
    		"https://qiita.com/tags/svelte/feed1",
    		"/pickup/rss1.xml",
    		"pickup/rss1.xml",
    		"/",
    		""
    	];

    	let feeds = [];

    	onMount(() => __awaiter(void 0, void 0, void 0, function* () {
    		$$invalidate(2, feeds = yield getFeeds(feedUrls));
    	}));

    	const onExec = e => __awaiter(void 0, void 0, void 0, function* () {
    		switch (e.detail.payload) {
    			case "confirm":
    				$$invalidate(2, feeds = yield getFeeds(feedUrls));
    				break;
    		}
    	});

    	const writable_props = ["name"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function feedinfo_feedUrls_binding(value) {
    		feedUrls = value;
    		$$invalidate(1, feedUrls);
    	}

    	$$self.$$set = $$props => {
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    	};

    	$$self.$capture_state = () => ({
    		__awaiter,
    		onMount,
    		getFeeds,
    		FeedInfo,
    		FeedList,
    		name,
    		feedUrls,
    		feeds,
    		onExec
    	});

    	$$self.$inject_state = $$props => {
    		if ("__awaiter" in $$props) __awaiter = $$props.__awaiter;
    		if ("name" in $$props) $$invalidate(0, name = $$props.name);
    		if ("feedUrls" in $$props) $$invalidate(1, feedUrls = $$props.feedUrls);
    		if ("feeds" in $$props) $$invalidate(2, feeds = $$props.feeds);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [name, feedUrls, feeds, onExec, feedinfo_feedUrls_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { name: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*name*/ ctx[0] === undefined && !("name" in props)) {
    			console.warn("<App> was created without expected prop 'name'");
    		}
    	}

    	get name() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new App({
        target: document.body,
        props: {
            name: "world",
        },
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
