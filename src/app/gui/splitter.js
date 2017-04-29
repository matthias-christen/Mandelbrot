/**
 * A Knockout.js horizontal or vertical splitter.
 *
 * Usage example (horizontal splitter):
 *
 * - HTML:
 *    <div class="parent">
 *        <!-- left pane -->
 *        <div class="left-pane">...</div>
 *
 *        <div class="splitter" data-bind="hsplitter: {left-pane-width}"></div>
 *
 *        <!-- right pane -->
 *        <div class="right-pane">...</div>
 *    </div>
 *
 * To fix the width of the left pane (i.e., make the left pane not resize when the
 * parent is resized), set the "flex-grow" CSS property of the left pane to 0 and
 * of the right pane to 1, and vice versa to fix the width of the right pane.
 *
 * - CSS:
 *    .parent {
 *        display: flex;
 *        flex-direction: row;
 *    }
 *
 *    .left-pane {
 *        flex: 0 0 100px;  // fix the width of the left pane
 *        min-width: 50px;  // optional
 *        max-width: 200px; // optional
 *    }
 *
 *    .right-pane {
 *          flex: 1;          // grow the width of the right pane with the container (parent) width
 *          min-width: 50px;  // optional
 *          max-width: 200px; // optional
 *    }
 *
 * The component updates itself on
 * - "resize" events on the window,
 * - "update-splitter" jQuery events on the document, which can be triggered manually when needed.
 */
(function()
{
    var defaultSplitterSize = 4;

    // when dragging the splitter and moving over an iframe, we lose the pointer
    // therefore, we insert a 100% width and height element on dragging that makes
    // sure the pointer is never lost to the iframe
    var $dragHelper = $('<div class="draghelper-iframe" style="position:absolute; left:0; top:0; width:100%; height:100%; z-index:0;"/>');

    function setPosition(posIdentifier, sizeIdentifier, $splitter, $pane, size)
    {
        var px = size + 'px';

        $splitter.css(posIdentifier, px);
        $pane.css({
            'flex-basis': px,
            '-webkit-flex-basis': px
        });
        $pane.css(sizeIdentifier, px);
    }

    function getCSSSize(identifier, $elt, $parent)
    {
        var size = $elt.css(identifier);
        var value = parseInt(size, 10);

        // handle percentage values
        if (!isNaN(value) && size.charAt(size.length - 1) === '%')
        {
            var parentSize = (identifier.indexOf('width') >= 0) ? $parent.width() : $parent.height();
            return value * parentSize / 100;
        }

        return value;
    }

    function restrictSize(size, splitterSize, $parent, $prev, $next, minSizePrev, maxSizePrev, minSizeNext, maxSizeNext, sizeIdentifier)
    {
        var prevPaneVisible = $prev.css('display') !== 'none';

        if (!isNaN(minSizePrev) && prevPaneVisible && size < minSizePrev)
            return minSizePrev;

        if (!isNaN(maxSizePrev) && prevPaneVisible && size > maxSizePrev)
            return maxSizePrev;

        var nextPaneVisible = $next.css('display') !== 'none';
        var parentSize = $parent[sizeIdentifier]();
        var nextPaneSize = parentSize - splitterSize - size;

        if ((!isNaN(minSizeNext) || !isNaN(maxSizeNext)) && nextPaneVisible && parentSize > 0 && nextPaneSize > 0)
        {
            if (!isNaN(minSizeNext) && nextPaneSize < minSizeNext)
                return parentSize - splitterSize - minSizeNext;

            if (!isNaN(maxSizeNext) && nextPaneSize > maxSizeNext)
                return parentSize - splitterSize - maxSizeNext;
        }

        return size;
    }

    function findFirstNonStaticallyPositionedAncestor($elt)
    {
        for (var $parent = $elt.parent(); !$parent.is('html'); $parent = $parent.parent())
        {
            var pos = $parent.css('position');
            if (pos === 'relative' || pos === 'absolute')
                return $parent;
        }

        return $('html');
    }

    function init(
        coordIdentifier, posIdentifier, otherPosIdentifier, sizeIdentifier, orthoSizeIdentifier,
        marginIdentifier, minSizeIdentifier, maxSizeIdentifier, cursor,
        element, valueAccessor)
    {
        var $document = $(document);
        var $window = $(window);

        var $splitter = $(element);
        var $prevPane = $splitter.prev();
        var $nextPane = $splitter.next();
        var $parent = $splitter.parent();

        // the "prev" pane is fixed if it has a zero "flex-grow"
        var isPrevPaneFixed = $prevPane.css('flex-grow') === '0' || $prevPane.css('-webkit-flex-grow') === '0';

        var minSizePrev = getCSSSize(minSizeIdentifier, $prevPane, $parent);
        var maxSizePrev = getCSSSize(maxSizeIdentifier, $prevPane, $parent);
        var minSizeNext = getCSSSize(minSizeIdentifier, $nextPane, $parent);
        var maxSizeNext = getCSSSize(maxSizeIdentifier, $nextPane, $parent);

        var splitterSize = parseInt($splitter.css(sizeIdentifier), 10);
        var hasSplitterSize = isFinite(splitterSize) && splitterSize > 0;
        if (!hasSplitterSize)
            splitterSize = defaultSplitterSize;

        var $posRefElt = findFirstNonStaticallyPositionedAncestor($splitter);
        var parentStartPos = $posRefElt.offset()[posIdentifier];

        var isDragging = false;


        // set up the splitter
        var splitterCSS = {
            position: 'absolute',
            'z-index': 1000,
            cursor: cursor
        };

        if (!hasSplitterSize)
            splitterCSS[sizeIdentifier] = splitterSize + 'px';
        splitterCSS[orthoSizeIdentifier] = '100%';
        splitterCSS[marginIdentifier] = (-splitterSize / 2) + 'px';
        $splitter.css(splitterCSS);

        if ($parent.css('position') === 'static')
            $parent.css('position', 'relative');


        // install event handlers

        $splitter.on('mousedown', function(event)
        {
            isDragging = true;
            event.preventDefault();
            event.stopPropagation();

            // remove all transitions on the panes and the splitter
            var noTransitions = {
                'transition-property': 'none',
                '-webkit-transition-property': 'none'
            };

            $splitter.css(noTransitions);
            $prevPane.css(noTransitions);
            $nextPane.css(noTransitions);

            $dragHelper.appendTo('body');

            $document.on('mousemove', mouseMoveHandler);
        });

        var mouseUpHandler = function()
        {
            if (isDragging)
            {
                isDragging = false;
                $document.off('mousemove', mouseMoveHandler);
                $dragHelper.detach();
                $window.trigger('resize');

                // restore the transitions on the panes and the splitter
                var restoreTransitions = {
                    'transition-property': '',
                    '-webkit-transition-property': ''
                };

                $splitter.css(restoreTransitions);
                $prevPane.css(restoreTransitions);
                $nextPane.css(restoreTransitions);
            }
        };

        var mouseMoveHandler = function(event)
        {
            if (isDragging)
            {
                var coord = event[coordIdentifier];
                if (coord === undefined)
                    coord = event['client' + coordIdentifier.toUpperCase()];

                var size = restrictSize(
                    coord - parentStartPos,
                    splitterSize,
                    $parent, $prevPane, $nextPane,
                    minSizePrev, maxSizePrev, minSizeNext, maxSizeNext,
                    sizeIdentifier
                );

                var modelValue = valueAccessor();
                if (ko.isWriteableObservable(modelValue))
                    modelValue(isPrevPaneFixed ? size : $parent[sizeIdentifier]() - size - splitterSize / 2);
                else
                {
                    if (isPrevPaneFixed)
                        setPosition(posIdentifier, orthoSizeIdentifier, $splitter, $prevPane, size);
                    else
                        setPosition(otherPosIdentifier, sizeIdentifier, $splitter, $nextPane, $parent[sizeIdentifier]() - size - splitterSize / 2);
                }

                $document.trigger('splitter-moved');
            }
        };

        var resizeHandler = function()
        {
            // we don't want to update the splitter if it's not visible, otherwise calculations are off
            if ($splitter.outerWidth() === 0 || $splitter.outerHeight() === 0 || $splitter.css('display') === 'none')
                return;

            // update the position of the splitter if the reference element is visible
            if ($posRefElt[sizeIdentifier]() > 0)
            {
                var size = isPrevPaneFixed ?
                    $prevPane[sizeIdentifier]() :
                    $parent[sizeIdentifier]() - $prevPane[sizeIdentifier]();

                $splitter.css(isPrevPaneFixed ? posIdentifier : otherPosIdentifier, size + 'px');
                parentStartPos = $posRefElt.offset()[posIdentifier];
            }
        };

        $document.on('mouseup', mouseUpHandler);
        $document.on('update-splitter', resizeHandler);
        $window.on('resize', resizeHandler);


        // detach event handlers when the DOM node is removed
        ko.utils.domNodeDisposal.addDisposeCallback(element, function()
        {
            $splitter.off('mousedown');
            $document.off('mouseup', mouseUpHandler);
            $document.off('mousemove', mouseMoveHandler);
            $window.off('resize', resizeHandler);
        });
    }

    function update(
        posIdentifier, otherPosIdentifier,
        sizeIdentifier, orthoSizeIdentifier, minSizeIdentifier, maxSizeIdentifier,
        element, valueAccessor)
    {
        var $splitter = $(element);
        var $parent = $splitter.parent();
        var $prevPane = $splitter.prev();
        var $nextPane = $splitter.next();

        var parentSize = $parent[sizeIdentifier]();
        var isPrevPaneFixed = $prevPane.css('flex-grow') === '0' || $prevPane.css('-webkit-flex-grow') === '0';

        var modelValue = valueAccessor();
        var size = ko.unwrap(modelValue);

        // check min/max widths/heights
        if ($splitter.is(':visible') && ko.isWriteableObservable(modelValue))
        {
            var prevSize = isPrevPaneFixed ? size : parentSize - size;
            var restrictedPrevSize = restrictSize(
                prevSize,
                parseInt($splitter.css(sizeIdentifier), 10) || defaultSplitterSize,
                $parent, $prevPane, $nextPane,
                getCSSSize(minSizeIdentifier, $prevPane, $parent),
                getCSSSize(maxSizeIdentifier, $prevPane, $parent),
                getCSSSize(minSizeIdentifier, $nextPane, $parent),
                getCSSSize(maxSizeIdentifier, $nextPane, $parent),
                sizeIdentifier
            );

            if (restrictedPrevSize !== prevSize)
                modelValue(size = isPrevPaneFixed ? restrictedPrevSize : parentSize - restrictedPrevSize);
        }

        // set the width/height
        if (isPrevPaneFixed)
            setPosition(posIdentifier, orthoSizeIdentifier, $splitter, $prevPane, size);
        else
            setPosition(otherPosIdentifier, sizeIdentifier, $splitter, $nextPane, size);
    }


    /**
     * Horizontal splitter (splitting horizontal panes).
     */
    ko.bindingHandlers.hsplitter = {
        init: init.bind(null, 'x', 'left', 'right', 'width', 'height', 'margin-left', 'min-width', 'max-width', 'ew-resize'),
        update: update.bind(null, 'left', 'right', 'width', 'height', 'min-width', 'max-width')
    };

    /**
     * Vertical splitter (splitting vertical panes).
     */
    ko.bindingHandlers.vsplitter = {
        init: init.bind(null, 'y', 'top', 'bottom', 'height', 'width', 'margin-top', 'min-height', 'max-height', 'ns-resize'),
        update: update.bind(null, 'top', 'bottom', 'height', 'width', 'min-height', 'max-height')
    };
})();
