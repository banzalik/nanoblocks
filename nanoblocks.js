var nb = {};

// ----------------------------------------------------------------------------------------------------------------- //

//  Минимальный common.js
//  ---------------------

//  Наследование:
//
//      function Foo() {}
//      Foo.prototype.foo = function() {
//          console.log('foo');
//      };
//
//      function Bar() {}
//      nb.inherit(Bar, Foo);
//
//      var bar = Bar();
//      bar.foo();
//
nb.inherit = function(child, parent) {
    var F = function() {};
    F.prototype = parent.prototype;
    child.prototype = new F();
    child.prototype.super = parent.prototype;
    child.prototype.constructor = child;
};

//  Расширение объекта свойствами другого объекта(ов):
//
//      var foo = { foo: 42 };
//      nb.extend( foo, { bar: 24 }, { boo: 66 } );
//
nb.extend = function(dest) {
    var srcs = [].slice.call(arguments, 1);

    for (var i = 0, l = srcs.length; i < l; i++) {
        var src = srcs[i];
        for (var key in src) {
            dest[key] = src[key];
        }
    }

    return dest;
};


// ----------------------------------------------------------------------------------------------------------------- //

//  Префиксы
//  --------
//
//  Поскольку предполагается, что блоки будут смешиваться (например, `nb.Events` подмешивается во все `nb.Block`),
//  то приватные методы и свойства отдельных классов будет называть со специальными префиксами.
//  Для `nb.Events`, например, это `__E_`, для `nb.Block` -- `__B_`.
//  Так как у блоков унаследованных от `nb.Block` могут быть свои приватные методы, то используем `__`, а не `_`.

// ----------------------------------------------------------------------------------------------------------------- //

//  nb.Events
//  ---------

//  Простейший pub/sub
//
//  nb.Events -- объект, который можно подмиксовать к любому другому объекту:
//
//      var foo = {};
//      nb.extend( foo, nb.Events );
//
//      foo.on('bar', function(e, data) {
//          console.log(e, data);
//      });
//
//      foo.trigger('bar', 42);
//
//  Или же:
//
//      function Foo() {}
//
//      nb.extend( Foo.prototype, nb.Events );
//
//      var foo = new Foo();
//
//      foo.on('bar', function(e, data) {
//          console.log(e, data);
//      });
//
//      foo.trigger('bar', 42);
//

nb.Events = {};

//  Возвращает список обработчиков события name.
//  Если еще ни одного обработчика не забинжено, возвращает (и сохраняет) пустой список.
nb.Events.__E_getHandlers = function(name) {
    var handlers = this.__E_handlers || (( this.__E_handlers = {} ));

    return handlers[name] || (( handlers[name] = [] ));
};

//  Подписываем обработчик handler на событие name.
nb.Events.on = function(name, handler) {
    var handlers = this.__E_getHandlers(name);

    handlers.push(handler);

    return handler;
};

//  Отписываем обработчик handler от события name.
//  Если не передать handler, то удалятся вообще все обработчики события name.
nb.Events.off = function(name, handler) {
    if (handler) {
        var handlers = this.__E_getHandlers(name);
        //  Ищем этот хэндлер среди уже забинженных обработчиков этого события.
        var i = handlers.indexOf(handler);

        //  Нашли и удаляем этот обработчик.
        if (i !== -1) {
            handlers.splice(i, 1);
        }
    } else {
        //  Удаляем всех обработчиков этого события.
        var handlers = this.__E_handlers;
        if (handlers) {
            delete handlers[name];
        }
    }
};

//  "Генерим" событие name. Т.е. вызываем по очереди (в порядке подписки) все обработчики события name.
//  В каждый передаем name и params.
nb.Events.trigger = function(name, params) {
    // Копируем список хэндлеров. Если вдруг внутри какого-то обработчика будет вызван off(),
    // то мы не потеряем вызов следующего обработчика.
    var handlers = this.__E_getHandlers(name).slice();

    for (var i = 0, l = handlers.length; i < l; i++) {
        //  Вызываем обработчик в контексте this.
        handlers[i].call(this, name, params);
    }
};

//  Общий канал для общения, не привязанный к конкретным экземплярам блоков.
nb.extend(nb, nb.Events);


// ----------------------------------------------------------------------------------------------------------------- //

//  Интерфейсная часть
//  ------------------

//  Метод создает блок на заданной ноде:
//
//      var popup = nb.block( document.getElementById('popup') );
//
nb.block = function(node) {
    var block_id = node.getAttribute('data-nb');
    if (!block_id) {
        //  Эта нода не содержит блока. Ничего не делаем.
        return null;
    }

    var block;

    var id = node.getAttribute('id');
    if (id) {
        //  Пытаемся достать блок из кэша по id.
        block = nb.Block.__B_cache[id];
    } else {
        //  У блока нет атрибута id. Создаем его, генерим уникальный id.
        id = 'nb-' + nb.Block.__B_id++;
        node.setAttribute('id', id);
    }

    if (!block) {
        //  Блока в кэше еще нет.
        //  Создаем экземпляр блока нужного класса и инициализируем его.
        block = nb.Block.__B_cache[id] = new nb.Block.__B_classes[block_id];

        //  Инициализируем блок.
        block.__B_init(node);
        block.trigger('init');
    }

    return block;
};

//  Метод определяет новый блок (точнее класс):
//
//      nb.define('popup', {
//          events: {
//              'init': 'init',
//              'click .close': 'close',
//              'open': 'open'
//          },
//
//          'init': function() { ... }
//          ...
//      });
//
nb.define = function(name, options) { // FIXME: Сделать миксины.
    var Class = function() {};
    nb.inherit(Class, nb.Block);

    var events = options.events;
    delete options.events;

    //  Все, что осталось в options -- это дополнительные методы блока.
    nb.extend(Class.prototype, options);

    //  Обрабатываем объект events: делим события на DOM и кастомные.
    nb.Block.__B_prepareEvents(events, Class);

    //  Сохраняем класс в кэше.
    nb.Block.__B_classes[name] = Class;
};

//  Неленивая инициализация.
//  Находим все ноды с классом `_init` и на каждой из них инициализируем блок.
//  По-дефолту ищем ноды во всем документе, но можно передать ноду,
//  внутри которой будет происходить поиск. Полезно для инициализации динамически
//  созданных блоков.
nb.init = function(where) {
    where = where || document;

    var nodes = where.getElementsByClassName('_init');
    for (var i = 0, l = nodes.length; i < l; i++) {
        nb.block( nodes[i] );
    }
};

nb.find = function(id) {
    var node = document.getElementById(id);
    if (node) {
        return nb.block(node);
    }
};

// ----------------------------------------------------------------------------------------------------------------- //

//  nb.Block
//  --------

//  Публичные методы у `nb.Block` следующие:
//
//    * `on`, 'off`, `trigger` -- миксин от `nb.Events`;
//    * `data` -- получает/меняет `data-nb`-атрибуты блока.
//    * `show`, `hide` -- показывает/прячет блок.

nb.Block = function() {};

// ----------------------------------------------------------------------------------------------------------------- //

//  Кэш классов для создания экземпляров блоков.
nb.Block.__B_classes = {};

//  Обработчики DOM-событий. Они добавляются по необходимости в прототип соответствующих классов.
nb.Block.__B_eventHandlers = {};

//  Список всех поддерживаемых DOM-событий.
nb.Block.__B_domEvents = [ 'click', 'dblclick', 'mouseup', 'mousedown', 'keydown', 'keypress', 'keyup' ]; // FIXME: Еще чего-нибудь добавить.
//  Regexp для строк вида `click .foo`.
nb.Block.__B_rx_domEvents = new RegExp( '^(' + nb.Block.__B_domEvents.join('|') + ')\\b\\s*(.*)?$' );

//  Автоинкрементный id для блоков, у которых нет атрибута id.
nb.Block.__B_id = 0;
//  Кэш проинициализированных блоков.
nb.Block.__B_cache = {};

// ----------------------------------------------------------------------------------------------------------------- //

nb.Block.prototype.__B_init = function(node) {
    this.node = node;
    this.__B_bindCustomEvents();
};

//  Вешаем кастомные (не DOM) события на экземпляр блока.
nb.Block.prototype.__B_bindCustomEvents = function() {
    var events = this.__B_customEvents;
    for (var event in events) {
        var handler = events[event];
        //  Если `handler` это строка, то нужно вызывать соответствующий метод блока.
        var method = (typeof handler === 'string') ? this[handler] : handler;

        //  method при это всегда вызывается в контексте that.
        this.on(event, method);
    }
};

//  Метод возвращает или устанавливает значение data-атрибута блока.
//  Блок имеет доступ (через этот метод) только к data-атрибутам с префиксом `nb-`.
//  Как следствие, атрибут `data-nb` недоступен -- он определяет тип блока
//  и менять его не рекомендуется в любом случае.
nb.Block.prototype.data = function(key, value) {
    if (value !== undefined) {
        this.node.setAttribute('data-nb-' + key, value);
    } else {
        return this.node.getAttribute('data-nb-' + key);
    }
};

//  Создаем методы блоков для обработки событий click, ...
//  Эти методы не добавлены в прототип Block сразу, они добавляются в класс,
//  унаследованный от Block только если этот блок подписывается на такое событие.
nb.Block.__B_domEvents.forEach(function(event) {

    nb.Block.__B_eventHandlers[event] = function(e) {
        var blockNode = this.node;
        var node = e.target;

        //  Идем вверх по DOM, проверяем, матчатся ли ноды на какие-нибудь
        //  селекторы из событий блока.
        var events = this.__B_domEvents[event];
        var r;
        while (1) {
            for (var i = 0, l = events.length; i < l; i++) {
                var event_ = events[i];
                var selector = event_.selector;

                //  Проверяем, матчится ли нода на селектор.
                if ( !selector || $(node).is(selector) ) {
                    var handler = event_.handler;
                    if (typeof handler === 'string') {
                        handler = this[handler];
                    }

                    //  Если событие с селектором, то передаем в обработчик ту ноду,
                    //  которая на самом деле матчится на селектор.
                    //  В противном случае, передаем ноду всего блока.
                    if ( handler.call(this, e, (selector) ? node : blockNode) === false ) {
                        r = false;
                    }
                }
            }

            //  Если хотя бы один блок вернул false, останавливаемся.
            if (r === false) { return r; }

            //  Дошли до ноды блока, дальше не идем.
            if (node === blockNode) { return; }

            node = node.parentNode;
        }
    };

});

//  Делим события на DOM и кастомные.
nb.Block.__B_prepareEvents = function(events, Class) {
    events = events || {};

    //  Делим события на DOM и кастомные.

    //  Добавляем в прототип информацию про DOM-события (в том числе и с уточняющими селекторами),
    //  которые должен ловить блок.
    var domEvents = Class.prototype.__B_domEvents = {};

    //  Добавляем в прототип информацию про кастомные события блока.
    //  Они будут забинжены на экземпляр блока при его создании.
    var customEvents = Class.prototype.__B_customEvents = {};

    for (var event in events) {
        //  Матчим строки вида `click` или `click .foo`.
        var r = nb.Block.__B_rx_domEvents.exec(event);

        var handler = events[event];
        if (r) {
            //  Тип DOM-события, например, `click`.
            var type = r[1];
            var typeEvents = domEvents[type] || (( domEvents[type] = [] ));

            typeEvents.push({
                selector: r[2] || '',
                handler: handler
            });
        } else {
            customEvents[event] = handler;
        }
    }

    //  Добавляем в прототип специальные обработчики для DOM-событий.
    //  Если, например, в блоке есть события `click .foo` и `click .bar`,
    //  то будет добавлен всего один обработчик `click`.
    //  Если у блока вообще нет ничего про `click`, то `click` не будет добавлен вовсе.
    for (var event in domEvents) {
        Class.prototype['__B_on' + event] = nb.Block.__B_eventHandlers[event];
    }
};

// ----------------------------------------------------------------------------------------------------------------- //

//  Показываем блок.
nb.Block.prototype.show = function() {
    $(this.node).removeClass('_hidden');
};

//  Прячем блок.
nb.Block.prototype.hide = function() {
    $(this.node).addClass('_hidden');
};

// ----------------------------------------------------------------------------------------------------------------- //

// FIXME: Сделать отдельные методы, работающие с нодами, а не с блоками.

//  Получить модификатор.
nb.Block.prototype.getMod = function(name) {
    return this.setMod(name);
};

//  Удалить модификатор.
nb.Block.prototype.delMod = function(name) {
    this.setMod(name, null);
};

//  Установить модификатор.
nb.Block.prototype.setMod = function(name, value) {
    var rx = new RegExp('(?:^|\\s+)' + name + '_([\\w-]+)'); // FIXME: Кэшировать regexp?

    var className = this.node.className;
    if (value === undefined) {
        // getMod
        var r = rx.exec(className);
        return (r) ? r[1] : '';
    } else {
        // delMod
        className = className.replace(rx, '').trim();
        if (value !== null) {
            // setMod
            className += ' ' + name + '_' + value;
        }
        this.node.className = className;
    }
};

// ----------------------------------------------------------------------------------------------------------------- //

//  Добавляем интерфейс событий ко всем экземплярам блоков.
nb.extend(nb.Block.prototype, nb.Events);

// ----------------------------------------------------------------------------------------------------------------- //

//  Инициализация библиотеки
//  ------------------------

$(function() {
    //  Инициализируем все неленивые блоки.
    nb.init();

    //  Навешиваем на документ обработчики всех событий,
    //  использующихся хоть в каких-нибудь блоках.
    nb.Block.__B_domEvents.forEach(function(event) {
        $(document).on(event, function(e) {
            var node = e.target;

            var block, parent;

            //  Идем вверх по DOM'у и ищем ноды, являющиеся блоками.
            //  Отсутствие parentNode означает, что node === document.
            while (( parent = node.parentNode )) {
                block = nb.block(node);
                if (block) {
                    var method = '__B_on' + event;
                    if  ( block[method] ) {
                        var r = block[method](e);
                        //  Если обработчик вернул false, то выше не баблимся.
                        if (r === false) { return r; }
                    }
                }
                node = parent;
            }
        });
    });
});

