// ==UserScript==
// @name         Cronometer Scrape
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds additional details to the Cronometer diary.
// @author       Sean Hickey
// @match        https://cronometer.com/
// @require      http://code.jquery.com/jquery-3.3.1.min.js
// @grant        GM_addStyle
// ==/UserScript==

/* eslint-disable no-multi-spaces */

const FAT_CALS_PER_GRAM = 9;
const UPDATE_INTERVAL   = 15000;
const READY_INTERVAL    = 3000;
const STYLES            = `
    .tm-percents p {
        margin: 0;
        text-align: left;
    }
    .table-wrapper {
        border-radius: 6px;
        margin-bottom: 15px;
        border: 1px solid #eee;
    }
    .table-wrapper .gwt-Label {
        white-space: normal;
        text-align: right
    }
    .table-title {
        text-align: center !important;
        white-space: nowrap;
     }
    .table-label {
        font-weight: bold;
    }
    .table-summary {
        background-color: #ccc !important;
    }
`;

(function($) {
    /**************************************************************************
     * Utils
     *************************************************************************/

    /**
     * Matches elements with the exact text value.
     */
    $.expr[':'].textEquals = $.expr.createPseudo((arg) => {
        return (elem) => {
            return $(elem).text().match(`^${arg}$`);
        };
    });

    /**
     * Adds commas to the given number.
     *
     * @param {Number} x
     * @returns {String}
     */
    const numberWithCommas = (x) => {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    /**
     * Creates a cronometer table.
     *
     * @param {string} title
     * @param {Array} rows
     * @returns {jQuery}
     */
    const htmlCreateTable = (title, rows) => {
        const $table = $('<table />', {
            'class':      'prettyTable targets-table',
            'style':      'width: 100%;',
            'cellpadding': 0,
            'cellspacing': 0
        });
        const $tbody = $('<tbody />').appendTo($table);

        $(`<tr class="prettyTable-header category">
            <td colspan="4">
                <div class="gwt-Label table-title">
                    ${title}
                </div>
            </td>
        </tr>`).appendTo($tbody);

        rows.forEach((row, i) => {
            const $row = $('<tr />', {
                'class': row.className || ((i % 2 === 0) ? 'evenrow' : '')
            }).appendTo($tbody);
            $(`<td>
                <div class="gwt-HTML table-label">
                    ${row.label}
                </div>
               </td>`).appendTo($row);

            row.cols.forEach((col) => {
                $(`<td>
                    <div class="gwt-Label">
                        ${col}
                    </div>
                   </td>`).appendTo($row);
            });
        });

        return $table;
    };

    /**************************************************************************
     * Scrapers
     *************************************************************************/

    /**
     * Scrapes all nutrient data from the page and returns an object containing the values.
     *
     * @returns {{
     *  general: { energy: number },
     *  lipids: { fat: number, saturated: number, monounsaturated: number, polyunsaturated: number, omega_3: number, omega_6: number },
     *  carbohydrates: *,
     *  protein: *,
     *  vitamins: *,
     *  minerals: *
     * }}
     */
    const scrapeNutrients = () => {
        const values = {};
        const $tables = $('.targets-table');

        $tables.each((i, t) => {
            const $table  = $(t);
            const $rows   = $table.find('tbody tr:not(.prettyTable-header)');
            const label   = $table.find('.prettyTable-header .gwt-Label').text().trim().toLowerCase();
            values[label] = {};

            $rows.each((i, r) => {
                const $row  = $(r);
                const name  = $row.find('.gwt-HTML').text().trim().toLowerCase().replace(/\s/g, '_').replace(/-/g, '_');
                values[label][name] = parseFloat($row.find('.gwt-Label:first').text().trim());
            });
        });

        return values;
    };

    /**
     * Scrapes all food data from the page and returns an object containing the values.
     *
     * @returns {Array}
     */
    const scapeFoods = () => {
        const foods = [];
        $('.diary-time').each((i, item) => {
            const $item    = $(item);
            const label    = $item.find('+ td + td .gwt-Label:first').text().trim();
            const amount   = $item.find('+ td + td + td .gwt-Label:first').text().trim();
            const unit     = $item.find('+ td + td + td + td .gwt-Label:first').text().trim();
            const calories = parseFloat($item.find('+ td + td + td + td + td .gwt-Label:first').text().trim());
            foods.push({ label, amount, unit, calories });
        });

        return foods;
    };

    /**************************************************************************
     * Modifiers
     *************************************************************************/

    /**
     * Adds a table to the sidebar which displays fat calories and percent of total calories.
     */
    const modAddFatsTable = () => {
        const nutrients     = scrapeNutrients();
        const lipids        = nutrients.lipids;
        const totalCalories = nutrients.general.energy;

        const saturatedCalories = parseFloat((lipids.saturated * FAT_CALS_PER_GRAM).toFixed(0));
        const saturatedPercent  = Math.round((saturatedCalories / totalCalories) * 100);
        const monoCalories      = parseFloat((lipids.monounsaturated * FAT_CALS_PER_GRAM).toFixed(0));
        const monoPercent       = Math.round((monoCalories / totalCalories) * 100);
        const polyCalories      = parseFloat((lipids.polyunsaturated * FAT_CALS_PER_GRAM).toFixed(0));
        const polyPercent       = Math.round((polyCalories / totalCalories) * 100);
        const omega3Calories    = parseFloat((lipids.omega_3 * FAT_CALS_PER_GRAM).toFixed(0));
        const omega3Percent     = Math.round((omega3Calories / totalCalories) * 100);
        const omega6Calories    = parseFloat((lipids.omega_6 * FAT_CALS_PER_GRAM).toFixed(0));
        const omega6Percent     = Math.round((omega6Calories / totalCalories) * 100);
        const totalFatCalories  = parseFloat((lipids.fat * FAT_CALS_PER_GRAM).toFixed(0));
        const totalFatPercent   = Math.round((totalFatCalories / totalCalories) * 100);

        const rows = [
            {
                label:     'Total',
                className: 'table-summary',
                cols:      [
                    `${lipids.fat} g`,
                    `${numberWithCommas(totalFatCalories)} c`,
                    `${totalFatPercent}%`
                ]
            },
            {
                label: 'Saturated',
                cols:  [
                    `${lipids.saturated} g`,
                    `${numberWithCommas(saturatedCalories)} c`,
                    `${saturatedPercent}%`
                ]
            },
            {
                label: 'Monounsaturated',
                cols:  [
                    `${lipids.monounsaturated} g`,
                    `${numberWithCommas(monoCalories)} c`,
                    `${monoPercent}%`
                ]
            },
            {
                label: 'Polyunsaturated',
                cols:  [
                    `${lipids.polyunsaturated} g`,
                    `${numberWithCommas(polyCalories)} c`,
                    `${polyPercent}%`
                ]
            },
            {
                label: 'Omega-3',
                cols:  [
                    `${lipids.omega_3} g`,
                    `${numberWithCommas(omega3Calories)} c`,
                    `${omega3Percent}%`
                ]
            },
            {
                label: 'Omega-6',
                cols:  [
                    `${lipids.omega_6} g`,
                    `${numberWithCommas(omega6Calories)} c`,
                    `${omega6Percent}%`
                ]
            }
        ];

        const $wrapper  = $('<div />', {
            'id':    'fats-table',
            'class': 'table-wrapper'
        });
        const $table = htmlCreateTable('Fats', rows).appendTo($wrapper);
        $table.css('cursor', 'pointer').attr('title', 'Click to update').on('click', modAddFatsTable);

        const $existing = $('#fats-table');
        if ($existing.length > 0) {
            $existing.replaceWith($wrapper);
        } else {
            $('.gwt-DatePicker:first').after($wrapper);
        }
    };

    /**
     * Switches the text on the ratios widgets.
     */
    const modSwitchRatios = () => {
        $('div:textEquals("Omega-6 : Omega-3")').text('Omega-3 : Omega-6');
        $('div:textEquals("Zinc : Copper")').text('Copper : Zinc');
        $('div:textEquals("Potassium : Sodium")').text('Sodium : Potassium');
        $('div:textEquals("Calcium : Magnesium")').text('Magnesium : Calcium');
    };

    /**
     * Moves the ratios to the top of the page.
     */
    const modMoveRatios = () => {
        const $ratios = $('div:textEquals("Nutrient Balances")').parent('div:first');
        $('#mercola-balances').replaceWith($ratios);
    };


    /**************************************************************************
     * Start!
     *************************************************************************/
    setTimeout(() => {
        GM_addStyle(STYLES);
        modSwitchRatios();
        modMoveRatios();
        modAddFatsTable();
        setInterval(modAddFatsTable, UPDATE_INTERVAL);
    }, READY_INTERVAL);
})(window.jQuery);