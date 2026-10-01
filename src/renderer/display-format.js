// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Scalar presentation only: never use this on model/editor or logic bindings. */
import {isDecimal} from '@genrojs/tytx';
import {toTytx} from '@genrojs/tytx';

const STYLES = new Set(['short', 'medium', 'long', 'full']);
const TOKENS = /('(?:[^']|'')*'|[a-zA-Z]+|[^a-zA-Z']+)/g;

function temporal(value, dtype) {
    if (!(value instanceof Date)) throw new TypeError('Temporal formats require a typed Date value');
    if (!Number.isFinite(value.getTime())) throw new RangeError('Invalid date');
    // TYTX D and H use UTC fields as civil carriers, not browser-local instants.
    const kind = dtype || toTytx(value).split('::').at(-1);
    if (!['D', 'H', 'DH', 'DHZ'].includes(kind)) throw new RangeError(`Unsupported temporal dtype: ${kind}`);
    return kind;
}

function patternDate(value, pattern, locale, kind) {
    const parts = pattern.match(TOKENS) || [];
    if (parts.join('') !== pattern) throw new RangeError('Unclosed format literal');
    const pad = (v, n=2) => String(v).padStart(n, '0');
    const name = options => new Intl.DateTimeFormat(locale, {timeZone:'UTC', ...options}).format(value);
    const date = {y:()=>String(value.getUTCFullYear()), yy:()=>pad(value.getUTCFullYear()%100), yyyy:()=>pad(value.getUTCFullYear(),4),
        M:()=>String(value.getUTCMonth()+1), MM:()=>pad(value.getUTCMonth()+1), MMM:()=>name({month:'short'}), MMMM:()=>name({month:'long'}),
        d:()=>String(value.getUTCDate()), dd:()=>pad(value.getUTCDate()), EEE:()=>name({weekday:'short'}), EEEE:()=>name({weekday:'long'})};
    const time = {H:()=>String(value.getUTCHours()), HH:()=>pad(value.getUTCHours()),
        h:()=>String(value.getUTCHours()%12||12), hh:()=>pad(value.getUTCHours()%12||12),
        m:()=>String(value.getUTCMinutes()), mm:()=>pad(value.getUTCMinutes()), s:()=>String(value.getUTCSeconds()), ss:()=>pad(value.getUTCSeconds()),
        a:()=>new Intl.DateTimeFormat(locale,{hour:'numeric',hour12:true,timeZone:'UTC'}).formatToParts(value).find(p=>p.type==='dayPeriod').value};
    const tokens = {...(kind==='H'?{}:date), ...(kind==='D'?{}:time)};
    return parts.map(part => {
        if (part.startsWith("'")) return part === "''" ? "'" : part.slice(1,-1).replaceAll("''", "'");
        if (!/^[a-zA-Z]/.test(part)) return part;
        if (!tokens[part]) throw new RangeError(`Unsupported date format token: ${part}`);
        return tokens[part]();
    }).join('');
}

export function formatDisplay(value, {format, mask, locale, dtype, places} = {}) {
    let text = value == null ? '' : String(value);
    if (value != null && value !== '' && (format != null && format !== '' || places != null)) {
        if (typeof value === 'number' || isDecimal(value)) {
            text = formatNumber(value, {format, locale, places});
        } else {
        const kind = temporal(value, dtype);
        if (STYLES.has(format)) {
            const options = {timeZone:'UTC'};
            if (kind !== 'H') options.dateStyle = format;
            if (kind !== 'D') options.timeStyle = format;
            text = new Intl.DateTimeFormat(locale || undefined, options).format(value);
        } else text = patternDate(value, String(format), locale || undefined, kind);
    }
    }
    return mask == null ? text : String(mask).replaceAll('%s', () => text);
}


function numericOptions({format='decimal', places}={}) {
    const options={maximumFractionDigits:20};
    if (!format || format==='decimal') options.style='decimal';
    else if(format==='percent') options.style='percent';
    else if(format==='scientific') options.notation='scientific';
    else {
        const match=/^(0|#,##0)(?:\.(0*)(#*))?$/.exec(format);
        if(!match || (format.includes('.') && !match[2] && !match[3])) throw new RangeError(`Unsupported number format: ${format}`);
        options.useGrouping=match[1].includes(',');
        options.minimumFractionDigits=(match[2]||'').length;
        options.maximumFractionDigits=(match[2]||'').length+(match[3]||'').length;
    }
    if(places!=null && places!=='') {
        const count=Number(places);
        if(!Number.isInteger(count)||count<0||count>20) throw new RangeError('places must be an integer from 0 to 20');
        options.minimumFractionDigits=count; options.maximumFractionDigits=count;
    }
    return options;
}
function formatNumber(value, options={}) {
    if(typeof value!=='number' && !isDecimal(value)) throw new TypeError('Number formatting requires a Number or Decimal');
    if(!Number.isFinite(Number(value))) throw new RangeError('Number must be finite');
    const formatter=new Intl.NumberFormat(options.locale||undefined,numericOptions(options));
    // Modern Intl accepts decimal strings without narrowing to IEEE 754.
    if(isDecimal(value) && new Intl.NumberFormat('en',{useGrouping:false}).format('9007199254740993')!=='9007199254740993') {
        throw new Error('This browser cannot format Decimal values without precision loss');
    }
    return formatter.format(isDecimal(value)?value.toString():value);
}
