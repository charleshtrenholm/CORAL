# Generix UI

This is the user facing portion of the Generix Data Clearinghouse. It is designed to simplify tasks
on our system that can be challenging for data producers and data consumers alike. 

## Installation

to get started, make sure you have npm and Angular installed. This app is built with Angular version
9.1.11.

`npm install -g @angular/cli`

Fork and clone a repo and then install all the necessary dependencies in package.json.

`npm install`

If you run into dependency problems you can't resolve, try installing an older version of @angular/cli.  This app has been successfully deployed with Angular version 9.1.11.

To run a development server, use the `ng serve` command and open your preferred browser to localhost:4200

## Deployment

Once you are logged into the server, you can find a clone of the repository at `/home/clearinghouse/env/generix-ui/generix-ui`.
Pull your changes and run the following build command:

`npm install`

`sudo ng build --prod --base-href /generix-ui/`

The build target directory is configured in angular.json to default to `/var/www/html/generix-ui/`. In order for the resources to be loaded correctly, the base href needs to be set to `/generix-ui/`. This can either be done with the `--base-href` flag as demonstrated above or you can manually change it in the index.html generated by the build command.

Note that everything in the build target directory will be deleted!

The --prod directive above configures the UI with the "prod"
environment, which is configured via src/environments/environment.prod.ts

If there is not an .htaccess file in the build target directory, a new one will need to be generated for the page to load. paste 
the following code below in a new .htaccess file at `/var/www/html/generix-ui/`:

```
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} -f [OR]
  RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} -d
  RewriteRule ^ - [L]

  RewriteRule ^ index.html
</IfModule>
```

You also need to be sure .htaccess files are enabled in your
web server setup; in Apache, be sure "AllowOverride All" is configured
for the build target directory.

## Testing

To manually run a test, you can activate the test script using `ng test`. In your terminal, the app will display building information and then show a timestamp of when it was connected to the server. If you are running on your local machine, the default launcher will be with Chrome. You can configure this option in `karma.conf.js`.

On your local machine, the browser will open a GUI that will display the test results. you can refer to the [karma docs](https://karma-runner.github.io/latest/index.html) for more information.

To test in a command-line only environment, e.g. a CI server, you can run the test with the same command while adding the following flags:

`ng test --browsers=ChromeHeadless --watch=false`

Specifying 'ChromeHeadless' will launch a headless instance of a chromium browser with which to run the tests. Make sure you have chromium installed the server. If you get an error from Karma saying that there is no binary for ChromeHeadless browser, you will need to configure an environment variable pointing to the location of your installed chromium:

`export CHROME_BIN=/usr/bin/chromium-browser`

the `--watch=false` flag is not necessary for single runs, but is important for running automated testing as it will terminate once the tests have been run, rather than wait for changes as is the default behavior.

**Important Note**: If you run into an issue where the test server disconnects, you can troubleshoot by inspecting the karma page and viewing the javascript console. There are occassionally errors that will not display in the command line that will log to the browser console.

## Overview

generix-ui is structured into modules that pertain to the part of the site the user is visiting. The following diagram is a high
level overview of the structure of the app.

```
app.module
|__ search.module
|   |__ search components
|__ upload.module
|   |__ upload components
|__ plot.module
|    |__ plot components
|__ shared folder
    |__ components
    |__ services
    |__ directives
    |__ models
    |__ pipes

```

 - components that do not require services (a simple display page) are declared at the app.module level and can be found in
`/src/app/shared/components`. 

 - each child module has 1 or more service(s) that act as controllers for the components within the modules. All service files 
 can be found in `/src/app/shared/services/`.

 - to encourage type safety, patterns that are commonly used throughout the app are stored as ES6 classes and can be found in
 `/src/app/shared/models`.

 ## Dependencies

 The following is a list of some of the core UI dependencies that our app depends on. It is not a comprehensive list but provides the most widely used 3rd party modules throughout the app.

 **PlotlyJS**

 [PlotlyJS](https://plot.ly/javascript/) is used to translate data bricks into data vizualizatoins that can be configured and viewed by
 the user. it is configured to work with angular using [angular-plotly](https://github.com/plotly/angular-plotly.js).

 Angular-plotly provides us with a simple to use `<plotly-plot>` component that takes a `data` and `layout` input. Server calls typically provide data and layout in sebarate objects in the response.

 *Important:* We are currently running angular-plotly at version 1.3.2 to prevent an issue that breaks
 changes for angular versions below 8. see [here](https://github.com/plotly/angular-plotly.js/issues/79) for more details.

 **jQuery**
 
[jQuery](https://jquery.com/) is installed in order to support custom UI element plugins, namely DataTables.

**DataTables**

[DataTables](https://datatables.net/) is used for rendering HTML tables with javascript to add search, filtering, and pagination to large tables. DataTables is currently implemented in generix-ui wihout an 
angular wrapper, so `$` will need to be imported from jQuery in order to render a table as a DataTable.
It is best to render a table in the AfterViewInit lifecycle hook with an ElementRef provided by angular 
as shown below:

```javascript
import { ElementRef, ViewChild } from '@angular/core';
import * as $ from 'jquery';
import 'datatables.net';
import 'datatables.net-bs4'; // for bootstrap 4 styles
...
export class SomeComponent implements afterViewInit {
    @ViewChild('table', { static: false }) private el: ElementRef;
    dataTable: any;

    ngAfterViewInit() {
        this.someService.getSomeData().subscribe(data => {
            // assign data to table
            const table: any = $(this.el.nativeElement);
            this.dataTable = table.DataTable();
        });
    }
}
```

**NgSelect**
[NgSelect](https://ng-select.github.io/ng-select#/data-sources) is used to create comboboxes that populate with data from our system. NgSelect elements can be rendered using a `<ng-select>` tag and take an input of `items`, where items is the data with will populate the dropdown and options take the congiguration for the dropdown. 

The text value that the user will see can be configured via the `bindLabel` property, which can be any of the values of the object that you're feeding the data to. 

You can also specify which property you want to model the data with via the `bindValue` property. The default value is the object selected in the `[items]` array. You can access user input selection via the `(change)` event. You can select a default value for an item with the `[(ngModel)]` directive.

component.ts file:
```javascript
    data = [
        {
            firstName: 'Elton',
            lastName: 'John'
        },
        {
            firstName: 'Bob',
            lastName: 'Marley'
        }
    ]

    handleChange(event) {
        console.log(event);
    }
```

component.html file:
```html
    <!-- example without bindValue (logs {firstName: '...', lastName: '...'}) -->
    <ng-select
        [items]="data"
        bindLabel="firstName"
        (change)="handleChange($event)"
    ></ng-select>

    <!-- example with bindValue (logs lastName) -->
    <ng-select
        [items]="data"
        bindLabel="firstName"
        bindValue="lastName"
        (change)="handleChange($event)"
    ></ng-select>
```
**Bootstrap 4 and Ngx-Bootstrap**

for CSS UI, [Bootstrap 4](https://getbootstrap.com/docs/4.0/getting-started/introduction/) is used along 
with [ngx-bootstrap](https://valor-software.com/ngx-bootstrap/#/) for advanced javascript features (e.g
modals and tooltips).
