/* ===========================================================================
   POPULATION INSIGHTS
   Shared, dependency-free data helpers for the dashboard and population page.
   All totals are calculated from Firestore /population/ observation records.
   =========================================================================== */

(function () {
    'use strict';

    var numberFormatter = new Intl.NumberFormat();

    function number(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function dateFromTimestamp(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        if (value instanceof Date) return value;
        if (typeof value === 'number') return new Date(value);
        var parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function dayKey(date) {
        if (!date) return '';
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function startOfDay(date) {
        var result = new Date(date);
        result.setHours(0, 0, 0, 0);
        return result;
    }

    function dateAtOffset(daysAgo) {
        var date = startOfDay(new Date());
        date.setDate(date.getDate() - daysAgo);
        return date;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function displaySpecies(name) {
        var species = String(name || 'Unidentified species').trim() || 'Unidentified species';
        return window.WI && typeof window.WI.displayLabel === 'function' ? window.WI.displayLabel(species) : species;
    }

    function normalize(record) {
        var observedAt = dateFromTimestamp(record.observation_date);
        var count = Math.max(0, Math.round(number(record.population_count)));
        return {
            id: record.id || '',
            species: String(record.species_name || 'Unidentified species').trim() || 'Unidentified species',
            displaySpecies: displaySpecies(record.species_name),
            location: String(record.location || 'Unspecified site').trim() || 'Unspecified site',
            count: count,
            observedAt: observedAt,
            source: record.image_id ? 'Image' : (record.audio_id ? 'Audio' : 'Observation')
        };
    }

    function sum(records) {
        return records.reduce(function (total, record) { return total + record.count; }, 0);
    }

    function aggregate(records, key) {
        var buckets = {};
        records.forEach(function (record) {
            var label = record[key] || 'Unspecified';
            if (!buckets[label]) buckets[label] = { label: label, count: 0, records: 0 };
            buckets[label].count += record.count;
            buckets[label].records += 1;
        });
        return Object.keys(buckets).map(function (label) { return buckets[label]; })
            .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
    }

    function between(records, start, end) {
        return records.filter(function (record) {
            return record.observedAt && record.observedAt >= start && record.observedAt < end;
        });
    }

    function dailySeries(records, days) {
        var values = {};
        var firstDay = dateAtOffset(days - 1);
        records.forEach(function (record) {
            if (record.observedAt && record.observedAt >= firstDay) {
                var key = dayKey(record.observedAt);
                values[key] = (values[key] || 0) + record.count;
            }
        });

        var series = [];
        for (var offset = days - 1; offset >= 0; offset -= 1) {
            var date = dateAtOffset(offset);
            series.push({ date: date, key: dayKey(date), value: values[dayKey(date)] || 0 });
        }
        return series;
    }

    function changeForPeriod(records, days) {
        var tomorrow = dateAtOffset(-1);
        var currentStart = dateAtOffset(days - 1);
        var previousStart = dateAtOffset((days * 2) - 1);
        var current = sum(between(records, currentStart, tomorrow));
        var previous = sum(between(records, previousStart, currentStart));
        var percent = previous ? ((current - previous) / previous) * 100 : null;
        return {
            current: current,
            previous: previous,
            percent: percent,
            direction: current === previous ? 'steady' : (current > previous ? 'up' : 'down')
        };
    }

    function relativeTime(date) {
        if (!date) return 'Waiting for timestamp';
        var seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hr ago';
        if (seconds < 172800) return 'Yesterday';
        return Math.floor(seconds / 86400) + ' days ago';
    }

    function formatDate(date, options) {
        if (!date) return 'Pending timestamp';
        return date.toLocaleDateString(undefined, options || { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateTime(date) {
        if (!date) return 'Pending timestamp';
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function renderBars(element, entries, options) {
        if (!element) return;
        var emptyText = (options && options.emptyText) || 'No observations for this period.';
        if (!entries.length || entries.every(function (entry) { return entry.count === 0; })) {
            element.innerHTML = '<div class="insight-empty">' + escapeHtml(emptyText) + '</div>';
            return;
        }

        var max = Math.max.apply(null, entries.map(function (entry) { return entry.count; })) || 1;
        var limit = (options && options.limit) || entries.length;
        element.innerHTML = entries.slice(0, limit).map(function (entry) {
            var width = Math.max(4, (entry.count / max) * 100);
            return '<div class="bar-row">' +
                '<div class="bar-row-label" title="' + escapeHtml(entry.label) + '">' + escapeHtml(entry.label) + '</div>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' + width.toFixed(2) + '%"></div></div>' +
                '<div class="bar-row-value">' + numberFormatter.format(entry.count) + '</div>' +
                '</div>';
        }).join('');
    }

    function renderLineChart(element, series, label) {
        if (!element) return;
        var total = series.reduce(function (acc, item) { return acc + item.value; }, 0);
        if (!series.length || total === 0) {
            element.innerHTML = '<div class="insight-empty">No dated population observations for this period yet.</div>';
            return;
        }

        var width = 720;
        var height = 230;
        var padding = { top: 20, right: 18, bottom: 35, left: 42 };
        var plotWidth = width - padding.left - padding.right;
        var plotHeight = height - padding.top - padding.bottom;
        var max = Math.max.apply(null, series.map(function (item) { return item.value; }));
        max = Math.max(1, Math.ceil(max * 1.15));
        var stepX = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;
        var points = series.map(function (item, index) {
            var x = padding.left + (index * stepX);
            var y = padding.top + plotHeight - ((item.value / max) * plotHeight);
            return { x: x, y: y, item: item };
        });
        var pointList = points.map(function (point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' ');
        var grid = [0, 0.5, 1].map(function (ratio) {
            var y = padding.top + plotHeight - (ratio * plotHeight);
            return '<line x1="' + padding.left + '" y1="' + y.toFixed(1) + '" x2="' + (width - padding.right) + '" y2="' + y.toFixed(1) + '" class="trend-grid"/>' +
                '<text x="' + (padding.left - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" class="trend-axis">' + numberFormatter.format(Math.round(max * ratio)) + '</text>';
        }).join('');
        var labelEvery = series.length > 14 ? Math.ceil(series.length / 6) : Math.max(1, Math.ceil(series.length / 7));
        var xLabels = points.map(function (point, index) {
            if (index % labelEvery !== 0 && index !== points.length - 1) return '';
            return '<text x="' + point.x.toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle" class="trend-axis">' +
                escapeHtml(formatDate(point.item.date, { month: 'short', day: 'numeric' })) + '</text>';
        }).join('');
        var dots = points.map(function (point) {
            return '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3.5" class="trend-dot"><title>' +
                escapeHtml(formatDate(point.item.date) + ': ' + numberFormatter.format(point.item.value) + ' ' + label) + '</title></circle>';
        }).join('');

        element.innerHTML = '<svg class="trend-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Population observations over time">' +
            '<defs><linearGradient id="trend-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.28"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0"/></linearGradient></defs>' +
            grid +
            '<polygon points="' + padding.left + ',' + (padding.top + plotHeight) + ' ' + pointList + ' ' + (width - padding.right) + ',' + (padding.top + plotHeight) + '" class="trend-area"/>' +
            '<polyline points="' + pointList + '" class="trend-line"/>' + dots + xLabels +
            '</svg>';
    }

    async function load(limit) {
        var records = await FireDB.getPopulation(limit || 500);
        return records.map(normalize).sort(function (a, b) {
            var timeA = a.observedAt ? a.observedAt.getTime() : 0;
            var timeB = b.observedAt ? b.observedAt.getTime() : 0;
            return timeB - timeA;
        });
    }

    window.PopulationInsights = {
        load: load,
        aggregate: aggregate,
        sum: sum,
        dailySeries: dailySeries,
        changeForPeriod: changeForPeriod,
        relativeTime: relativeTime,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        formatNumber: function (value) { return numberFormatter.format(number(value)); },
        escapeHtml: escapeHtml,
        renderBars: renderBars,
        renderLineChart: renderLineChart,
        filterPeriod: function (records, days) {
            return between(records, dateAtOffset(days - 1), dateAtOffset(-1));
        }
    };
})();
