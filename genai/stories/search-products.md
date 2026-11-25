# Search the catalog

Tags: @regression

As a customer
I want to search the product list
So that I can find an item without scrolling

## Scenario: Searching by name narrows the list

Given I am logged in as a customer
When I open the products page
And I search for "keyboard"
Then I see 1 product
And I see the product "Mechanical Keyboard"
