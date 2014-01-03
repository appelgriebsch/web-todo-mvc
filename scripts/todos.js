// An example Backbone application contributed by
// [Jérôme Gravel-Niquet](http://jgn.me/).
// This demo shows the use of the
// [PouchDB adapter](backbone-pouchdb.js)
// to persist Backbone models within your browser
// and to be able to replicate the data to and from a server.

// Load the application once the DOM is ready, using `jQuery.ready`:
$(function () {

    var dbname = 'todo-items-v1';

    // Save all of the todo items in the `"todos-backbone"` database.
    Backbone.sync = BackbonePouch.sync({
        // We currently suffix by the PouchDB version here
        // because at the moment PouchDB does not support upgrade
        db: Pouch(dbname),
        fetch: 'query'
    });

    // Adjust id attribute to the one PouchDB uses
    Backbone.Model.prototype.idAttribute = '_id';

    // Todo Model
    // ----------

    // Our basic **Todo** model has `title`, `order`, and `done` attributes.
    var Todo = Backbone.Model.extend({

        // Default attributes for the todo item.
        defaults: function () {
            return {
                type: "todo",
                title: "empty todo...",
                created: new Date().toISOString(),
                finished: "false",
                user: App.loggedInUser
            };
        },

        // Ensure that each todo created has `title`.
        initialize: function () {
            if (!this.get("title")) {
                this.set({"title": this.defaults.title});
            }
        },

        // Toggle the `finished` state of this todo item.
        toggle: function () {
            var finished = this.isFinished() ? "false" : "true";
            this.save({finished: finished});
        },

        // Remove this Todo from *PouchDB* and delete its view.
        clear: function () {
            this.destroy();
        },

        isFinished: function () {
            return this.get("finished") == "true";
        }
    });

    // Todo Collection
    // ---------------

    // The collection of todos is backed by *PouchDB* instead of a remote
    // server.
    var TodoList = Backbone.Collection.extend({

        // Reference to this collection's model.
        model: Todo,

        // Include todos in Map Reduce response. Order by `created`.
        pouch: {
            options: {
                query: {
                    fun: {
                        map: function (doc) {
                            if (doc.type === 'todo') {
                                emit(doc.created, null);
                            }
                        }
                    },
                    conflicts: true,
                    descending: true
                },
                changes: {
                    filter: function (doc) {
                        return doc._deleted || doc.type === 'todo';
                    }
                }
            }
        },

        // Filter down the list of all todo items that are finished.
        finished: function () {
            return this.filter(function (todo) {
                return todo.isFinished();
            });
        },

        // Filter down the list to only todo items that are still not finished.
        remaining: function () {
            return this.without.apply(this, this.finished());
        },

        // Todos are sorted by their original insertion order.
        comparator: function (todo) {
            return todo.get('created');
        }
    });

    // Create our global collection of **Todos**.
    var Todos = new TodoList;

    // Todo Item View
    // --------------

    // The DOM element for a todo item...
    var TodoView = Backbone.View.extend({

        //... is a list tag.
        tagName: "li",

        // Cache the template function for a single item.
        template: _.template($('#item-template').html()),

        // The DOM events specific to an item.
        events: {
            "click .toggle": "toggleDone",
            "click #edit": "edit",
            "click #destroy": "clear",
            "keypress .edit": "updateOnEnter",
            "blur .edit": "close"
        },

        // The TodoView listens for changes to its model, re-rendering. Since there's
        // a one-to-one correspondence between a **Todo** and a **TodoView** in this
        // app, we set a direct reference on the model for convenience.
        initialize: function () {
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
        },

        // Re-render the titles of the todo item.
        render: function () {
            this.$el.html(this.template(this.model.toJSON()));
            this.$el.toggleClass('done', this.model.isFinished());
            this.$el.toggleClass('conflicts', _.size(this.model.get('_conflicts')) > 0);
            this.input = this.$('.edit');
            this.options = this.$('#options');
            return this;
        },

        // Toggle the `"done"` state of the model.
        toggleDone: function () {
            this.model.toggle();
        },

        // Switch this view into `"editing"` mode, displaying the input field.
        edit: function () {
            this.$el.addClass("editing");
            this.options.addClass("hidden");
            this.input.focus();
        },

        // Close the `"editing"` mode, saving changes to the todo.
        close: function () {
            var value = this.input.val();
            var oldValue = this.model.get("title");

            if (!value) this.clear();

            if (value != oldValue)
                this.model.save({title: value});

            this.$el.removeClass("editing");
            this.options.removeClass("hidden");
        },

        // If you hit `enter`, we're through editing the item.
        updateOnEnter: function (e) {
            if (e.keyCode == 13) this.close();
        },

        // Remove the item, destroy the model.
        clear: function () {
            this.model.clear();
        }
    });

    // The Application
    // ---------------

    // Our overall **AppView** is the top-level piece of UI.
    var AppView = Backbone.View.extend({

        // Instead of generating a new element, bind to the existing skeleton of
        // the App already present in the HTML.
        el: $("#todoapp"),

        // Our template for the line of statistics at the bottom of the app.
        statsTemplate: _.template($('#stats-template').html()),

        // Delegated events for creating new items, and clearing completed ones.
        events: {
            "keypress #new-todo": "createOnEnter",
            "click #clear-completed": "clearCompleted"
        },

        // At initialization we bind to the relevant events on the `Todos`
        // collection, when items are added or changed. Kick things off by
        // loading any preexisting todos that might be saved in *PouchDB*.
        initialize: function () {
            this.input = this.$("#new-todo");

            Todos.bind('add', this.addOne, this);
            Todos.bind('reset', this.addAll, this);
            Todos.bind('all', this.render, this);

            this.stats = this.$('#stats');

            Todos.fetch();
        },

        // Re-rendering the App just means refreshing the statistics -- the rest
        // of the app doesn't change.
        render: function (e, a) {
            var done = Todos.finished().length;
            var remaining = Todos.remaining().length;

            if (Todos.length) {
                this.stats.show();
                this.stats.html(this.statsTemplate({done: done, remaining: remaining}));
            } else {
                this.stats.hide();
            }
        },

        // Add a single todo item to the list by creating a view for it, and
        // appending its element to the `<ul>`.
        addOne: function (todo) {
            var view = new TodoView({model: todo});
            this.$("#todo-list").append(view.render().el);
        },

        // Add all items in the **Todos** collection at once.
        addAll: function () {
            Todos.each(this.addOne);
        },

        // If you hit return in the main input field, create new **Todo** model,
        // persisting it to *PouchDB*.
        createOnEnter: function (e) {
            if (e.keyCode != 13) return;
            if (!this.input.val()) return;

            Todos.create({title: this.input.val()}, { wait: true });
            this.input.val('');
        },

        // Clear all done todo items, destroying their models.
        clearCompleted: function () {
            _.each(Todos.finished(), function (todo) {
                todo.clear();
            });
            return false;
        }
    });

    // Finally, we kick things off by creating the **App**.
    var App = new AppView;

    // The Application
    // ---------------

    // Our overall **ReplicationAppView** is the top-level piece of UI.
    var ReplicationAppView = Backbone.View.extend({

        // Instead of generating a new element, bind to the existing skeleton of
        // the App already present in the HTML.
        el: $("#sidebar"),

        // Delegated events for creating new items, and clearing completed ones.
        events: {
            "click #connect": "setupSync",
            "click #disconnect": "deleteSync"
        },

        // At initialization we bind to the relevant events on the `Replications` and `Replications`
        // collections, when items are added or changed. Kick things off by
        // loading any preexisting replications and replications that might be saved in *PouchDB*.
        initialize: function () {

            this.url = this.$("#url");
            this.user = this.$("#name");
            this.pwd = this.$("#pwd");

            this.url.val(sessionStorage.couchDBUrl);
            this.user.val(sessionStorage.couchDBUser);
            this.pwd.val(sessionStorage.couchDBPwd);
        },

        // If you hit return in the main input field, create new **Replication** model,
        // persisting it to *PouchDB*.
        setupSync: function () {
            if (!this.url.val() || !this.user.val() || !this.pwd.val()) return;

            sessionStorage.couchDBUrl = this.url.val();
            sessionStorage.couchDBUser = this.user.val();
            sessionStorage.couchDBPwd = this.pwd.val();

            App.loggedInUser = this.user.val();

            this.replicate({url: this.url.val(), user: this.user.val(), pwd: this.pwd.val()});
        },

        // cancel sync and cleanup the locally stored data
        deleteSync: function() {
            if (App.pullRepl) {

                App.pullRepl.cancel();
            }

            if (App.pushRepl) {

                App.pushRepl.cancel();
            }

            sessionStorage.couchDBUrl = sessionStorage.couchDBUser = sessionStorage.couchDBPwd = '';
            PouchDB.destroy(dbname);
            location.reload(true);
        },

        replicate: function (model) {
            var url = model.url,
                user = model.user,
                pwd = model.pwd

            var schemeLength = url.indexOf('://', 0);
            var serverDBUrl = url.substr(0, schemeLength + 3) + user + ':' + pwd + '@' + url.substr(schemeLength + 3);

            App.pushRepl = Pouch.replicate(dbname, serverDBUrl, {
                continuous: true
            });

            App.pullRepl = Pouch.replicate(serverDBUrl, dbname, {
                continuous: true,
                filter: 'app/byUser'
            });
        }
    });

    // Finally, we kick things off by creating the **App**.
    var ReplicationApp = new ReplicationAppView;
});
