# Vehicles in Games — Vehicle Physics & Engine Sound

A talk by **Wasim Al-Hajumar** ("wasimulator") — surgeon and Handmade-community
developer, creator of _AV Racer_. Reference for trailer-trainer's car physics and
procedural engine-sound work.

---

0:00
We are rolling. So everybody I will need your attention because the
0:05
next speaker is an unusual one with a background in medical tech no medical
0:13
field medically trained surgeon on the stage. Please welcome
0:20
round of applause to Wasim Al-Hajumar known as was simulator.
0:29
Hello. Hello. And good evening. Am I on? Great.
0:35
Um, so welcome to Brea. Um, I'm extremely
0:40
happy to be here. This is a breathtaking little town and the company that I'm in
0:45
right now in the last few days is even more breathtaking. I'm absolutely humbled to be in the company of so many
0:52
intelligent people that I absolutely admire and have admired for many years. So um today I'm excited to talk to you
1:00
about a topic that I am very passionate about. But before I get into it um for those who don't know me a little bit
1:06
about myself. Uh my name is Wasim Hajumar. You may know me online through my handle was simulator on uh Discord
1:13
and X and other places. Um I am a physician by trade. Um and I'm a
1:19
practicing surgeon right now uh located in Munich, Germany. In my free time, I
1:25
tend to program. Um, I've picked this up during med school. Um, a friend of mine
1:30
helped me get through it and introduced me to a very interesting course called Intro into C. That's how I got into uh
1:37
the whole handmade Hero story and how I got to know so many people over the years. Some of the stuff that I've made
1:44
through my u programming journey has been have been some of the stuff I
1:49
finished making. Uh, sorry. um our AV racer which is a racing car game. I'll
1:56
be talking about that a little bit in my talk today. Uh Rebound Express, a little uh jam project, physical puzzler, and an
2:02
open source project called Cactus Viewer and Image Viewer where I tried to solve the Windows photos problem.
2:09
So today we're going to talk about vehicles in games. Now, vehicles are is
2:17
is something or vehicles are something that um you find as a staple of many games, of many genres, not even
2:23
necessarily focused about vehicles. It's something that u it's almost something you expect whenever you have any kind of
2:31
world that has travel in it unless it's like a fantasy game. Um and there is a
2:37
wide variety of different games. The experience is absolutely expansive. Um,
2:42
this is just a small collection of a few games that honestly a few games that are
2:48
out there over the years and I've played a big chunk of those because I ever since I was a kid, ever since I was yay
2:53
big, I would try to pick up the next racing game as soon as it's available on the platform that I had. So, the the
3:00
interesting thing about all this is that games create an experience. Racing games create an experience. And that experience is very variable,
3:06
interestingly. Like it's not it's not like um when you're playing something that has physics in it where you expect
3:12
a certain behavior in physics and it's either it's that or it's not very well implemented. When you have a experience
3:17
of shooting games when you have the weapons you expect the weapons to behave in a certain way and if they don't then it feels weird. In cars in vehicles
3:25
there there's a variety of experience. Take this for example. Um in this game
3:31
Mario Kart um it's the furthest thing from reality imaginable. You're sliding
3:36
around jumping in a car that is proportionately incorrect and you're throwing things at your friends and but
3:43
people love it. There huge numbers of sales and people enjoy this experience because it tells you it gives you an
3:50
interesting experience. On the other end of the spectrum, you have something like this, racing simulators, where you'd
3:56
have a guy who has a multiple thousand dollars uh expensive racing rig and um
4:02
would be moving around and like honing their craft and practicing for many years in competitive online racing. And
4:09
that is also an experience and they're both vehicles and the principles of how they were programmed in the engine are
4:15
actually the same, the major principles. So
4:20
programming cars in games and car physics in games is an art as much as a science actually and um everybody does
4:27
it differently. So why does why is that the case? Why do we why does that
4:34
happen? Because as I said like when you have those uh physical physics based games or RT or real-time strategy or
4:40
when you're moving a character you expect a certain behavior. Why? Because because we are intimate with that behavior from a first person
4:47
perspective. But when it comes to cars, the experience is not really necessarily firsthand. It's a secondhand experience
4:53
that we map into real life. And a lot of it is coming from pop culture. We have this almost all of us have an
4:59
understanding of what a racing car is supposed to feel like, even though very very few have ever actually been in one,
5:05
let alone driven it. So when we watch movies like like this, um we see the guy
5:12
shift up 700 times in one race and like what kind of a gray gearbox is that? Well, it doesn't matter, does it?
5:18
Because in the end, what matters is the feeling that I am shifting up gear. So, even a kid will know I want a car that
5:25
feels like I'm doing something when I'm shifting up gear. So, the main question that you have to ask yourself if you're
5:30
want to implement a car in a game and this is what the talk is is is aimed for for people who are interested in doing
5:36
that is what experience do I want to convey? And the more important leading
5:41
question is how do I even implement that experience? So through my um journey
5:47
trying to figure this out, I realized that the problem is a little bit complex because of this variety of experience
5:55
and the complexity of cars in general. You have to approach a problem from both sides. You have to understand the
6:00
experience and you have to understand the machine. And then somewhere in between those two, you'll find the
6:06
solution perfect for your game design. So let me tell you a little bit about my first attempt. This is a racer. uh a
6:12
very first draft I had to pull out pull up code from way long ago. You see here I have a simple Newtonian model. Um it's
6:20
a sprite looking top down. I spent maybe way too much time on the art of this thing. But um what's happening is that
6:26
I'm controlling the position through acceleration and braking. I'm changing that uh multiply by dt. The angle that
6:32
the car is turning in is moving by um an angular velocity that I actually smartly
6:38
incor hook to the velocity so that it doesn't turn when it's standing still. And that's it. Now, this is as far as I
6:45
could think of when I'm thinking about this and like, does this look like a car to you? It's it's not. This is I don't
6:50
know what this is. Something robotic moving on rails. So, I went through a second iteration
6:57
where I would thought I would Oh, yes. Where I thought I would um make
7:06
it a little bit more smooth. See, at that time, I didn't know how the physics worked that well. I thought like I would
7:12
try to I understand the experience somehow. I've played a lot of racing games, so I need the car to slide a little bit when I turn, but the slide
7:17
has to be smooth. So, I started to implement smooth step functions and more of like nonlinear uh analytical formulas
7:24
that explain the describe the the movement of the car. And it looks better. I mean, like it's now it's sliding a little bit. It's drawing the
7:30
trail behind it that's pushing the back wheels a bit. Now, when I did this, I um
7:35
it was during the time where Casey was asking like, "Does anybody have something to demonstrate?" And I showed this to him and uh he told me, "Doesn't
7:42
this feel to you like the car is a little bit on ice?" And I think I agree. The car looks like
7:48
a floating spaceship moving around. It doesn't feel like the wheels are like the tires are what's carrying the car
7:54
around. It feels like it's all on a pivot because it is honestly. So I went to a third attempt because I
8:00
was like dead set on making this faking this as best as possible. So I added
8:05
even more magical numbers and I param and I did a parameter out of slidiness of the car so that it increases the
8:11
slidiness the more the angle increases and this changes other things through time and I have no idea what's happening
8:18
with the video but um you see the car now this is actually the something closer to the final version that I
8:24
pushed for that game and it's it really feels solid some it feels fun to drive in the end um and this is uh what it
8:32
looks like right now like uh this is you can Find the detailed devlog on this game on my website osimulator.com. And
8:38
this is actually also available on Steam. You can buy it now. Um, it's not perfect. I was not happy with how hacky
8:45
it was. There was a lot of fake variables, but in the end, the point I'm trying to make here is that if you try
8:50
to focus on the experience, you can still get something interesting coming out, but you're always limited because in the end, you'll find edge cases where
8:56
this is not really behaving like the car you want to behave. But the important thing is you need to simulate the experience and not the machine.
9:04
But also you need to understand the machine because if you don't understand the machine you're limited and that's what connects both the two together. So
9:12
after I did this I thought okay my next project I'm going to try to really do this correctly and I looked online and
9:20
started researching how do cars work and I realized that that I also need to understand the the physics of how the
9:27
racing driver experiences the car as well before I understood this. So doing
9:32
that um has brought me really much further than um I ever got to with the
9:38
previous car game. And I thought in this talk I would sum the things up that you should care about the conceptual ideas
9:45
and how the general algorithm of how I implemented them and how I think like you could implement them because this I
9:52
still haven't solved the problem. I'm still working on it but this has brought me really far. So let's take stock of
9:58
what we have to deal with. There are three main conceptual components when we're dealing with a car. Um the first
10:05
one is the engine. Logically, that's the most important part for the car. Like that's what you think about when you're thinking about the car. That's the thing
10:12
that moves it. In this case, this includes the gearbox as well. In simple input output terms, this is what takes
10:17
uh the inputs of the of the player which is the gas and the shifter and outputs um outputs a speed to the wheel and that
10:24
synchronizes with the wheel because the engine is running at a certain speed that synchronizes with the wheel speed
10:30
and that's what's happening. It's multiplied by the gear ratio. The next aspect is basically the wheels and the
10:35
tires. Um that one takes the input of the engine speed and torque uh from
10:40
before before the the one before um and takes the input of the player which is the brakes and the steering and the
10:47
weight load from the chassis above it. This this simple thing that's sitting on top of it and uh the friction with the
10:53
road and that's actually a very important aspect that's uh that we need to get into. what it outputs are the
11:00
results of those friction forces that apply on the car and also it outputs a speed that synchronizes with the engine.
11:07
So there's this differential relationship that we have to also figure out because the engine synchronizes the wheels but the wheels also synchronize
11:13
the engine. And the last aspect and the simplest one is the chassis. The chassis is a simple
11:19
rigid body. Um this is the plug into your reg into the rest of your physics engine because you hook everything to
11:26
this part. uh it gets affected by aerodynamics, by drag and by gravity.
11:31
And wherever it moves, it moves the wheel. So that's its effect on the rest of the body. Okay. So how do games
11:38
approach doing this? Because this is a lot of it's it's way too high level. There's each one of those components is
11:44
complex. Well, the reality of it, depending on the game, they cut corners.
11:49
So the problem with that, the reason is you can't really simulate everything. I don't think anybody is really except for
11:56
maybe like the uh the engineers in some basement at Porsche and Stoutgart are really figuring out the fluid dynamics
12:03
of of the fuel moving through the pistons and and shooting around. Nobody's doing that. At reality, in even
12:10
the most complex racing simulators out there, at some low enough level, there's a black box. And that black box is just
12:17
calculating something similar, something simple, and it's uh taking some input and turning out some output.
12:23
while looking through this thing. Okay, how do people then do it because it's starting to look like there's a million ways to do these things. Well, actually
12:29
there is a million ways to do these things. There's no definitive bible out there when it comes to um to programming
12:35
vehicles. Like I can't point you to okay, look at the implementation of that thing and that's thing is the solution. It's not that easy and often the really
12:43
interesting parts and the crux of the matter is proprietary because that's where there is u um a lot of comp
12:49
competition of how to get this right. So in the end you will have to un choose the corners like actively choose the
12:55
corners you have to cut you're going to cut. So this you're not going to get that satisfying feeling like I got the simulation right. I don't think you can
13:01
because you have to cut the corner at some point. So to put this all together in a visual form for visual learners. Um
13:08
we have three components the engine uh tire and the wheel and the chassis. Um there is a continuous differential
13:14
equation on the uh horizontal axis. The engine is synchronizing its speed to the
13:20
RPM speed to the wheels and the wheels are synchronizing back to the engine and the wheel itself is applying forces on
13:26
the chassis. The chassis is moving the wheels. So there's this back and forth. The chassis hooks to the rest of your um
13:33
physics engine and the meaty part of the tires of the simulation is actually the
13:39
tire because that's the thing that um sticks to the ground and that's the thing that generates the forces. All of
13:44
the forces come from the tire. Um, and that's the tire model for those who know
13:50
that term from racing simulation. So, this is a general algorithm of how
13:56
to do it in code in in pseudo code. Um, inside your physics step, you loop on each vehicle. You simulate its engine.
14:03
Um, and for each wheel, you have to do this on every each wheel separately, which is what I did not do in a racer.
14:08
You update uh and simulate the tires. And in the end you apply that to the chassis and uh when you're done you
14:16
integrate you do the collision you resolve collision the rest of the physics engine remains the same.
14:21
So let's start with the first section the first algorithm the engine. Now the
14:27
engine is maybe the most conceptually the most complicated uh part of the uh
14:32
of the car. It has the most moving parts but in code it's the simplest part of the code because actually it's just a
14:39
basic torque calculator. it it cares about one value and it updates just one value. Um so plotting some somewhat
14:48
realistic uh data on on how much power torque and drowns per minute. Power is
14:54
how much the power the engine generates. Let's assume it's always constant. In this case it's 100 kilowatts. Um at a
14:59
rotating speed of 5,000 RPM it's generating 200 torque. Now that's way too fast for the wheels especially if
15:05
you want to start driving the car. So you have to scale that down. But by doing so you increase the power. It's
15:11
just a simple physics um relationship. So the transmission scales it down to 1428 differential scales it down 380.
15:18
And in the end you have at the wheels if you multiply it with the radius you have a linear force of 9,500 newtons. It's a
15:25
huge force that gets you a lot of turning for a smaller rate. Now why am I telling you all this Um well to
15:33
understand that the power is also um variable because for those who are intimate with cars and are fans of cars,
15:40
you may recognize this this shape of this of of this uh graph. You have two
15:46
curves, two hills near each other. One of them represents the torque, the other one represents the power. They're more
15:51
or less conceptually the same thing. They're just you you multiply them through the drivetrain if someone is interested with the formulas there. What
15:58
it what what you what you need to care about this is that if you want to make the car feel realistic, you will realize
16:04
that depending on the RPM value of the engine, you get a different amount of power out of the wheels.
16:12
So, if you're driving around, you want to make the car feel real, you need to make it variable, even if it's not the exact same graph. You realize if you
16:18
look up different engine graphs, that peak is sometimes lower. It's sometimes moving to the to the left, more to the
16:24
right. Sometimes it's the slope is steeper. sometimes it's flatter each one
16:29
describes a different engine and um that's the important point you need to take home out of this. So, okay, I
16:37
understood that. How how do I put this into code? Well, you fake it. I'm going
16:43
to show you a little ab abomination that I did once. Um whatever this is, I don't think you'll find this in any book
16:48
because nobody nobody does like this. Um, this is just I've been sitting around at Desmos
16:55
for like an hour or two until I figured out something that looks like that curve with enough knobs that I can turn to
17:01
play around with it. That's it. Because I wanted to have the ability to control the curve. Like these are the things
17:06
that you can do with it. The A value can adjust the curve baseline. The B adjusts its magnitude of the peak. C adjusts the
17:13
end slope. D the peak of the X position. Blah blah. This is what it looks like when you're playing around in Desmos.
17:19
And you see I have a lot of I have have a lot of freedom working with it. And what I do with this is I
17:26
just take that algorithm implement it in code and now I have a blackbox that can take an RPM variable and give me a power
17:33
variable and I can just put it in the engine code. Cool. So the next thing we
17:39
I mentioned is also that there's the differential the gearbox. The gearbox is just a simple lookup table of ratios.
17:46
That's it. based on whatever gear you are, it multiplies the speed and reduces
17:52
the torque. So this is these are graphs a car enthusiasts might be familiar
17:57
with. you have something like that gear ratio over there that plots the uh the
18:03
optimal gear like um the the first gear is the longest one that it goes up in in
18:09
RPM the more the speed increases and then you switch the second gear which then the speed drops of the RPM down to
18:15
5,000 and then third gear fourth gear and so on and here we plot the power the the the force that's been generated and
18:22
it's also like the strongest when it's the slowest speed and then it drops down basic physics but what you care about
18:27
programmatically is just that lookup table and you can tune these value and you can make the car more um aggressive
18:34
in the acceleration but less that strong in the top speed and vice versa and even more tweaks so that you can tune the
18:40
car. Okay, that's another thing we care about. Well, let's put these together. How do I implement this? Well, these are
18:47
the two differential equations that are the hardest to crack. Um
18:53
I try to solve them this way. I mean what what the R dr over DT is basically I'm saying RPM plus equals this time DT.
19:02
Um so I'm adjusting the RPM in one line and I'm adjusting the wheel angular velocity on the other. This is something
19:08
you have to solve in code. Well, let's look at the the individual variables of how these work. So the RPM um the first
19:14
component you multiplied by the engine torque to torque curve that's K0
19:19
um times the throttle input. So like you take how much percentage the throttle input is going and then you look it up
19:26
uh look up the current RPM value and you get a torque curve. That's how you that torque value. You multiply that like you
19:31
scale it somehow. You add to that. This is the solution I
19:37
um implemented for the differential equation. It's a it's a spring. It's basically you take the expected value
19:42
and the actual value of what the uh uh current RPM is supposed to be. the expected value based on the current
19:48
wheel speed and the current value and that scales it down so that the the engine tries to synchronize with the
19:54
wheel and you multiply it by a certain scaler to make sure you get the um the
20:00
right feel to it. The third one is just basic friction. The engine when you're not when it's not hooked to anything, it
20:06
just when you give it some gas and let it go, it slows down on its own because just friction power forces uh slows it
20:13
down. So that's the general algorithm. three main components. You can add other ones depending on like little factors
20:18
like in actual code. I also implement the the minimum RPM and maximum RPM caps
20:24
in this thing somehow like numerically. You can do some tweaks here and there. But that's the general way that got a
20:30
good enough model working. On the other hand, the wheels angular velocity does also something similar. There's the
20:36
spring at the beginning. I'm taking the expected angular velocity based on the current RPM curve minus the uh current
20:44
angular velocity. So like they're both trying to converge on the same point. And you multiply that also by the engine
20:50
torque curve minus the braking force based on the braking input of the player minus just regular friction forces that
20:57
caused any wheel to slow down based on um loss of kinetic energy through friction. And those are the two bigger
21:05
two relatively bigger beasts in the uh physics engine of the car. And in the
21:10
end and I need sound for this. Do we have sound? You hand you have
21:16
something that's like this. This is a this is um this is taken from my current
21:21
physics engine of the car like my current engine. I'm demonstrating the uh horsepower curve and the gear ratios.
21:28
And I'm going to let you hear the sound of the engine play.
21:35
See, I changed some variables.
21:53
And interesting here is that you're seeing some some terms like bore, displacement, cam shaft, profile, turbo.
21:58
Where does that go in all the stuff that I mentioned? This is all fake. This is all stuff that I am claiming have relate
22:05
to it. I looked up what they actually do to the dork curve somewhere and then I
22:10
hooked them up to the magic variables in here like the knobs so that whenever I turn one of those it affects those knobs
22:17
and in the end you have something that feels like I'm tuning an actual engine where it's not I'm not making a research
22:22
simulation. I'm making something that makes you feel like you're playing around with an engine that that somewhat correlates with reality. So that's the
22:29
cool part about it. And here I can change the gear ratios. And I also hooked up all those variables to the sound generation. So now the sound
22:36
generation also feels like, oh, whenever I change this aspect of the engine, the sound changes. Oh, so I did something
22:42
when I bought that upgrade in the at the shop when I was playing the game. So for
22:47
those who are interested, a little bonus of how I did that sound simulation for the engine. Um, when I researched this
22:54
and I had to figure this out also for AV Racer, there are four different four major ways that people do this. The the
23:02
official way that one that we have in um in AAA games is sample based. That's
23:08
when you have a lot of money um and you take that money and you throw it at a studio that uh gives you microphones
23:14
that you hook up to the vehicle in different position and you record it at different times under different stress conditions and you use those all of
23:21
those very expensive samples to come up with a smart um algorithm that puts them all together, blends them and you have
23:27
something that feels and sounds really good. That's these are like games like Fortza do stuff like that.
23:32
um or you were um penniles like I was and I took one sample of like a rev and
23:38
I just pitch shifted it sounded like absolute crap and that's one of the main thing that people say when they play
23:44
that game that the sound of the engine not that good but that's what that's something you can do um what I currently
23:50
do is audio synthesis like I synthesize the audio from sine waves and noise functions um that was really fun to work
23:57
on I'll talk about that in a second one is model simulation where you You use samples of explosions, tiny explosions
24:04
and tiny little samples that you play at a really concentrated uh frequencies and
24:11
you get an emergent sound out of that. And the batchet crazy version is the
24:16
fluid simulation. And there's a guy you can look up on YouTube. I think some of you already know who I'm talking about.
24:22
It's called um Angiyagi. Um he s he does a fluid simulation of what's happening at the engine and through that has
24:29
immersion sounds. Make sure you look that up on YouTube after this. Um, so
24:34
here's a general u pseudo pseudo code of how I implemented it. Um, I gener I set
24:40
a base frequency based on the current RPM and then I calculate a few harmonics that um relate to this frequency.
24:46
Whatever harmonics, whatever bass frequency you just choose one as long as the relationship is somewhat regular.
24:53
And then I calculate how many frames I need to complete like two full cycles of that uh frequency. And because I have a
24:58
custom engine, I have to send that sample continuously to the uh to the thread that runs the audio engine. For
25:05
each frame, I generate base noise. Make sure you generate base noise because that's contributes to like 50% of the
25:10
feeling that the car feels real and modulate that base noise based on the RPM value. And then I calculate frame
25:17
constant scalers that change the higher or lower the RPM is and the engine characteristics. And this is something
25:23
I'm going to keep touching on. The more stuff change dynamically over time, the more realistic the thing will feel.
25:29
Regardless whatever thing you're making, the more knobs change in a regular fashion but dynamically over time, the
25:36
more it will feel real. And then I construct a uh the sample through
25:41
triangle sine wave, regular sine wave. I think there's also yeah the s the saw
25:47
sine wave and a noise modulated sine wave. And then like I add like a whistling sound for tours and stuff like
25:54
that. You can go nuts with this thing. And then you modulate the end sample based on the uh cylinder constants and
25:59
you mix all of those for a bunch of cylinders and you push it and you have that what you just heard.
26:06
Okay. So what I wanted to say is that you modulate things based on different characteristics and then you watch the magic happen. Okay. So that's that for
26:15
the engine. Let's move to the second part. We were just having the potatoes. Now we get to have the meat. The tire.
26:22
Uh the tire is the most important part of u a racing game. If you get that
26:29
right, you will have a car that feels right. If you get that wrong, it will feel wrong. Now, the tire is
26:36
um it's it's a it's a it's a marvel of engineering. We've reinvented the wheel
26:42
a few times, but actually we've improved the wheel a few times. And ever since we discovered that we you can use vulcanization to make synthetic rubber,
26:49
it has been a gamecher because um those things can move dynamically and
26:56
blend and they have a lot of um potential elasticity in them that
27:02
actually that's that's the elasticity that moves uh that generates the forces. It's it's when the wheel or when the
27:08
tire deforms and has that that increasing elastic force is what makes
27:13
the car move. So what happens at a smaller scale to understand the physics is you have a certain kind of gear uh a
27:20
rubber gearing like this is the tire that sits like right above the ground. The asphalt has ups and downs, hills and
27:26
valleys and the tires is hovering above it. When the tire sits down and has some normal pressure pressure from above, the
27:34
rubber starts to deform and it's no longer solid. But what it does, it starts to gear with the with the ground.
27:41
What happens is that there in middle positions where there's high pressure,
27:46
there's some kind of elastic u um the friction the the static friction is
27:52
sitting on it and those are the compression zones um that you have as the wheel tries to turn. Um this also
28:00
generates um heat that deform that that changes the characteristics of the
28:05
rubber itself. It improves the way it grips. All this is some physics. But the idea is that you understand there's some rubber gearing happening and and it's
28:11
that what makes the thing. But the problem is that that elasticity is not
28:17
endless like it's it's not a fluid in the end. It's it's a solid. So it has a limit and as long as you're within that
28:24
limit you can have a force and you can have control over the tire because as soon as you leave that limit the tire
28:30
starts sliding. So now you're no longer controlling the tires contact with the road. Now you can express those limits
28:37
of elasticity in uh the force that the tire generates and plot that on a circle
28:42
and somehow uh and that and you can break that component into longitudinal and lateral components of what uh what
28:48
what those forces are. This is how people studied this. They're like, okay, a tire is driving around, turning left
28:54
and right, and accelerating, decelerating, and we're getting measurements on how much force is happening. Let's plot that, calculated,
29:01
and okay, let's see what's happening on the longitudinal lateral components of it. And because we're
29:06
realizing that you can more or less put a circle around the maximum force that the tire can generate.
29:12
So, let's take a look at those both components. um the tire longitudinal component.
29:19
In both of those topics, a very important distinction needs to be u understood between what is static
29:26
friction and dynamic friction is. Um I'm sure a lot of you already know this, but I will reiterate for those who don't.
29:33
Static friction happens when like my laptop sitting on the table. Um, it's in
29:38
it's it's it's in friction. Like even if I start to to to lean the table forward, it may stand still for a while. This is
29:45
static friction. Like it's there's a friction between the thing and the table. There's actual kind of gearing happening at the micro level that's
29:52
preventing it from moving down. And as soon as I move it like I I I I let it fall down entirely, it will start
29:59
slipping. That's where you have dynamic friction. So understanding this concept
30:05
of what static and what dynamic friction is is really helpful to understand what I'm about to say in the next few slides.
30:11
And you have and you really need to understand those things. Like I'm not going on a on a big tangent with this because if you understand this, it's
30:17
really easy to implement afterwards. So static friction, let's imagine a tire
30:22
that's sitting on the road with a normal force coming from above and it's just rolling. It's rolling down the road.
30:29
What we what the important variables we need to look at here is that what's the angular velocity of the wheel and what the angular velocity of the tire on the
30:35
outside. It's it's equal. They're equal to each other. It's just rolling. It's the same angular velocity. There's
30:41
rubber gearing happening and a static friction constantly happening on the ground. So that rolling tire, what
30:47
happens if I hit the gas and I give it a little bit more gas? What happens? Well,
30:52
what happens is that the inner wheel, that's the thing that drives the tire, spins at a slightly higher angular
30:58
velocity than the outside tire. So, it becomes, it starts to deform. It starts to twist it. Now, that discrepancy
31:07
causes deformation of the entire tire. You have a compression zones in the forward position and decompression zones
31:12
in the backward position. And this starts to stress the rubber. And this is what's what in the end
31:19
generates the force. Now, if I add too much power, this wheel starts to spin, start to have like I can do donuts now.
31:26
Um, and at that point, you might as well have like they will they will end up having the same the more or less the
31:32
same angular velocity because now there's no twisting happening. It's just sliding on top of it. Now, here's a nice
31:37
video from Goodyear. I think some of you know this. You see how the tire deforms
31:43
as the car starts to accelerate and it twists like Okay, it's also getting
31:50
static. It twists like mad. Now, no real tire twists this much. This is a drag
31:55
racer. Um, but the concept is the same. It's that twisting that's like the tire
32:00
is is resisting that twist and resulting forward energy is pushing the axle of
32:05
the wheel. So, why am I telling you all of this? Well, because the difference of the
32:11
angular velocities is something we need to care about. And that thing is called the slip ratio.
32:17
The slip ratio is a term I hate because I think it's a misnomer. Um, but it's
32:22
it's a very uh it's the official term that people use when it comes to these things. But I don't think it describes
32:28
really well what it is. I think it's just the difference between the the driven wheel and the rolling wheel.
32:34
That's that's the way it's defined by Society of Automotive Engineers as the formula above. You basically just need
32:39
to care about the angular velocity of the wheel compared to the angular velocity of the tire. That's more or less what it is. Another way to express
32:46
it is like this. That's by the Kspan tire research facility. Kspan is currently actually working with beam
32:51
beamg drive in in working on their tire models for that game. They get access to the nice toys. You as an indie developer
32:58
don't. So, okay, that's the slip ratio. Why do I care? Um, you care because of the next
33:06
graph and because you're here. um the slip ratio uh if you plot the slip ratio
33:12
on the x-axis and on the y- axis you you plot the normalized traction force that's generated you realize there's a
33:18
dynamic where uh the more increasing the difference of the angular velocity the more it increases the the higher the
33:25
generated traction force through those elastic forces are until it reaches peak
33:31
and that's the point where the wheel no longer can grip with the ground anymore it starts to slip and so it starts to
33:36
drop until you reach a point where it's just spinning But even then there is some traction force pushing forward. So
33:41
like even the spinning wheel pushes the car forward a little bit. Or in the
33:47
other case if you're breaking the wheel you have the case where you lock the wheels like when you see it in Formula 1
33:53
cars a lot where they like they hit the brakes so hard that they lock the wheels and the wheels just sliding forward but
33:59
it still slows the car down somewhat. So like there's always some generative force, but you can also see that the braking uh slip ratio like the curve is
34:06
is a little bit more um gentle. It has something to do with where the
34:12
compression is happening on the direction of the moving tire. You can look that up if you're interested, but it's not very important for this. The
34:17
idea that you should care about is that there's a curve that looks like this that I need to somehow put into code. So
34:23
to sum this all this dry stuff up, the longitudinal forces are a function of
34:30
the slip ratio and a driven and a bra or a driven or brake wheel has a slip ratio that is not
34:36
zero. Um a non-zero slip value does not mean that the wheel is locked or or or or
34:43
sliding because the the amount of slip ratio does not really correlate directly with whether the wheel right now is in a
34:50
complete static or dynamic friction. It all depends on many factors. So like all of this is fluid between it goes between
34:56
static and dynamic friction and perfect grip when you're driving around is when
35:01
you are at a low enough but a nonzero uh slip ratio. This is for the longitudinal force. Okay. So how does this translate
35:08
to code? Good question. Um you remember when I uh when I talked about the uh
35:16
abomination that I showed you a while earlier? um somebody did a non-abomination but it's the same idea
35:23
and it's uh an an analytical function that describes those um forces that
35:30
person is Hanspe Pekka uh a Dutchborn tire scientist who spent the entirety of
35:37
his life working on tires and he came up with this beautiful formula up there
35:42
with three knobs that you can work with and those knobs adjust um the magnitude
35:48
ude and they describe the way that curve moves around and you can use something
35:53
like this in code to come up with a number that you can help scale your forces by. So in the end actual code
36:00
looks like this. It's not that it's not that much. So I'm integrating the wheel
36:05
angle. I'm calculating the contact velocity and the velocity of the uh of the rolling uh tire and I am calculating
36:12
a slip uh variable out of this. I'm plugging it through that the call span uh function I showed earlier to
36:19
calculate a slip ratio and then I'm plugging it through the uh pa formula and that thing gives me a good scaler
36:26
that I can multiply my forces with. Here are a few examples. This is from my current um project that I'm working on.
36:32
In this case, you see that the back wheel is really spinning more than the
36:38
front wheel is and the back wheel is not really synchronized with the ground moving beneath it. This is because the back wheel has a very high slip ratio.
36:46
You can see on this graph and so the resulting force that's coming out of it is really low.
36:52
On the other on the other end of the spectrum, you have this case where I am where while you're hitting the gas and
36:59
taking your foot off the gas, you're slightly increasing the slip ratio, slightly not. And that's moving uh it's
37:05
generating a little bit of of slip force that is pushing the car forwards and the wheels are somewhat synchronized. So
37:12
this is the behavior that you can the emergent behavior that you can get out of implementing this um this thing.
37:19
Okay. So that's the the longitudinal component. We can look at the lateral component. Now that's the more
37:24
interesting one. Um when we look at the wheel now this we're looking for at it
37:29
from this side. Now we're turning it 90 degrees. We're looking at it from this side. When a wheel turns, it actually
37:36
deforms around the place around the contact its contact patch with the
37:41
ground. So like there's a lateral force that is deforming it somewhat like this.
37:47
A demonstrative video. This is like a video of a rolling wheel on a treadmill where they're turning the wheel as it
37:53
moves. And you can see the more the angle of the movement is, the more the there's like a large deformation
37:58
happening at the wheel itself, at the tire itself at the bottom. Um, another
38:04
example, this is also really cool. Uh, the higher the load you put on it, the more it deforms. Like here, it's trying
38:10
left and right and then adding a little bit more pressure and then trying left and right and then adding a little bit more pressure. And you can see like the
38:16
deformation like the patch is actually moving left and right now uh increasingly.
38:22
So, what you need to care about when it comes to this thing are a few angles. Um, in this case, we're looking at a
38:29
tire top down, the front left tire of the car. the car is pointing upwards in this case. Um, DC is the vector that's
38:37
where the car is pointing. DW is the direction that the wheel is pointing. V, the blue vector is the velocity vector
38:44
of the wheel and the tire of of the wheel and the car. In this case, they're the same, but usually there's like some
38:50
sort of angular momentum the body of the car that changes the velocity of the wheel. That's not important. The idea is that there's a general direction of the
38:55
velocity of the wheel. Um, and through all of those you get two angles. You get
39:01
an angle between the direction of the wheel and direction of the car. That's like the steering angle. And a more
39:06
interesting angle is between direction of the wheel, direction of the and the velocity vector. And that angle is
39:12
called the slip angle. You're like, wait a second. Wasn't there a slip angle before? There was a slip ratio before.
39:18
This is a slip angle. And this sheds more light. Why I hate those terms? Because they're confusing. A slip angle
39:25
has something to do with the lateral forces. The slip ratio has something to do with the longitudinal forces.
39:32
Really easy to confuse. I much prefer if they use like uh um SL and no SL and SL
39:39
doesn't work either. So it has to be S longitudinal and S lateral. Um
39:44
so what happens to the contact patch? That's what happen what I wanted to demonstrate to you like so you can
39:49
understand visually as well what's happening because you don't really need to simulate this. This is what people at
39:55
tire simulate at tire research facility and beam and G drive do. Um so the
40:01
contact patch deforms um in the itself like there's a position where it's hits
40:07
it's in contact with the road where it's completely in static uh friction. That's the where it's like immediately like
40:13
entirely pointing in the direction of the tra of travel. Uh and the rest is where it starts deforming. Now tire
40:20
engineers have fig have seen that there's actually a very interesting distribution of forces that it's not
40:27
really constant all over. There's a whole thing we can simulate out of this. And this is what really advanced car
40:32
simulators do. They add like testing points all over the contact patch so that they generate a different force based on different testing point. You
40:39
don't really need to go this deep if you're doing just a regular car. But if you're interested in actual car tire
40:45
simulation and and making a sim racer, this is how deep you need to go. But the what you need to care about for this
40:51
talk is that the central point is in static friction, the ends are in dynamic friction. That's more or less it. Here
40:58
is a somewhat animated form. So you can see how it's the more the angle
41:03
increases, how the thing deforms and starts to move. Also, the lateral forces push the thing a little bit to the
41:09
right. You can see here it's demonstrated how the contact patch gets smaller actually the more um angle you
41:17
have until you reach a point where you have a large enough angle that the contact patch is basically zero. That's where you have completely static
41:22
friction. You're just slipping on the road. Now where is this observed in real life in the concept of under steer and
41:29
over steer? Um, for those who a lot of people who are interested in cars know this, but what this means for those who
41:35
don't, under steer is when you want to turn at a certain radius and the car does not want to give you that smaller
41:40
radius. So, the car really doesn't respond that well. It you have a larger arc. Over steer is the more also the
41:47
more scary one, the one where you lose control of the back wheels and the car starts to slip. Um, on icy roads, for
41:53
example, you have that or when you're driving a rear rear drive car and you add a little bit more gas like the car
41:58
starts to slip and you have that drift. This is what drifting is in the end. Um, how that uh relates to the slip uh
42:06
angles when you're neutral steering where you have full control of the car. The front
42:11
slip angle of the front wheels and the the slip angle of the front wheels and the slip angle of the back wheels are more or less the same. In under steer,
42:18
the front wheels have a little bit larger slip angle than the back wheels. And over steer, it's the other way
42:24
around. Now, do I need to coat this? Not really because all of this is
42:30
emergent. If you simulate the tire forces correctly, all of that stuff is
42:36
actually emergent behavior. But if you don't do that, then you have to fake it, which is what I did for AV Racer.
42:42
Show you a little bit more graphs. Um, this is a general description of how the
42:50
connection between the slip angle and the lateral force. You can also see it behaves the same way as the original graphs I showed you before for the
42:55
longitudinal aspects. um increasing quickly reach a peak and then trail down. Another aspect we need to care
43:02
about is that the force that's applied the normal force on the wheel that's pressing it to the ground also changes
43:07
the behavior. So there's a lot of factors you care about this. The the good thing is that all of this also can
43:13
be simulated with the PCA formula that I showed you before. So the PCA magic formula can be plotted in and the actual
43:19
code for this is that you just it's just four lines of code. You calculate the angles that you care about. You plot it
43:25
through the PCA formula with certain knobs that you've twisted to to fit a certain characteristic and you have um a
43:32
lateral force. This is what it looks like. Is it playing? Wait a second. There you go.
43:40
Now in this case I am you see here as I'm driving around and turning the
43:46
position of the current generated slip force is changing. This is based on the front wheels
43:53
and I got and I get that feeling that this is what causes the car then to move left and right. But the interesting part
43:58
I want to show you in the next slide is what happens when I start to play with those knobs. Like I have here the front
44:04
tires I am going to decrease the uh the amount
44:10
of generated slip force. And now I'm getting under steer. Now I'm turning the car left and right and the car is not
44:15
really responsing to the direction I want to turn it. Now, if I return it back and then I go to the rear wheels
44:22
and I do the same here, I get over steer. The car is starting to slide more. I'm getting a
44:28
drifter all of a sudden. And all of this is just basically I'm chasing one floating point variable. That's it.
44:35
That's the fun part about developing cars is that um once you get the
44:40
building blocks right you get a fantastic sandbox where you can test a lot of behaviors and then you can out of
44:48
this out of these changes you can say okay what if I attach this to the weather so that maybe if it's wet this
44:53
variable goes down what if I attach it to the how much wear there is on the tire and how much uh heat there is on
45:00
the tire and so on um that gives me those uh results So, it's pretty fun. I
45:06
recommend it. Key takes for the slip angle. The slip angle u um is the angle
45:14
between where the wheel is pointing and where it's going. Uh the lateral forces
45:19
are uh a function of the slip angle and uh the difference between the flip
45:26
angles of the front and the back axle is what generates what what makes the uh experience of of driving the car of the
45:31
stability of the car. Now the larger the slip angle, the smaller the contact patch, the more you move into dynamic
45:38
friction, the more you get into slide and the vertical load also amplifies that. So the key take is that all of
45:45
this is emergent and the more parameterization you have
45:50
in your code, it it the more it helps you in in making it realistic. But it's not haphazard. If that parameterization
45:57
is based on actual physical understanding of the models, it will help you a lot more.
46:03
And um this is what I touched at at the beginning. The more things that are changing dynamically over time under
46:08
different conditions, the more realistic it feel because there really is are very very few real constants in physics. Now
46:16
the kicker between in in all of this is um actually the most complicated part of
46:22
this talk and I don't expect everybody to understand. It certainly took me a hell of a lot of time to wrap my head
46:28
about this is the relationship between those two lateral and longitudinal forces and how they affect each other
46:34
because I've showed you earlier, you can plot those in a circle and there's this is actually one force that we're looking at. We're we're talking about one tire.
46:41
We're not talking about two different things. So what happens is this when we
46:47
start to observe the curve of one while changing the variable of the other. Like
46:52
if I'm looking at a a curve that plots the slip ratio like that's for the
46:57
longitudinal force and the braking and traction force that gets out of this is basically the paga formula by the way.
47:03
And now what happens if I change the slip angle you can see that as the slip angle above there increases the more the
47:11
curve deforms. So actually depending on the slip angle I have a different
47:17
looking curve entirely. So like all of my variables that I was talking about earlier the knobs they need to turn
47:23
themselves actually the more the angles are happening like this is also for the lateral force the lateral force also
47:29
changes depending on the slip angle. So all of this is
47:35
also uh changing with time.
47:41
So to sum it up the longitudinal force is a function of a slip ratio. The lateral force is a function of the slip
47:48
angle and they both affect each other. Okay, this is where it gets complicated.
47:53
So we talked about the friction circle before. Um I actually called it the u
47:59
the the range of elasticity before but it's actually they people call it the friction circle uh in books. Um and this
48:06
is the where where you try to conceptualize the maximum limit that you have of the combined
48:12
force of the longitudinal and lateral aspect of the force by that quadratic formula
48:18
um and how they affect each other. To visualize how they affect each other, what happens is when one increases it
48:24
squeezes the circle in a certain direction like in this case there's a certain um slip ratio that changes how
48:31
much lateral force range you have. So like as the slip angle increases
48:37
it changes the limit of the longitudinal aspect and as the slip ratio increases changes the limit of the lateral force.
48:43
This is again why I hate the slip ratio and slip angle as terms like even without using them it's hard to wrap your head about. Now you have something
48:49
that's confusing you while you're doing that. Great. Um people have plotted that on uh combined graphs. So like here you
48:58
have on one axis you are actually showing the same graph as before but they're both on one axis. So like this
49:03
is how much lateral force is um like on on the x- axis you have how much lateral
49:09
force on the top correlates with what slip angle and on the longit on the uh
49:15
vertical axis on the y- axis you have how much slip ratio connecting to how much traction force and the combined
49:21
force is then plotted and you realize based on how much the other one or the other is it changes. So you have this
49:28
combined resultant force. This is I know this is a
49:34
you don't need to care about plotting this. What I want us to offer you is that this is just a general
49:40
understanding that this is um these things are related and they affect each other. So you have resulting forces that
49:47
you want to like if you are at the limit the resulting forces at limit of that circle that's how much force that you can generate. if you're within it um you
49:54
are in a safe zone. So you can add more force generating to it. To make it a little bit more understandable in racing
50:00
terms, there is this uh G traction circle like GG traction circle. Um this
50:06
is actually like you plot the G-forces of a racing car while the driver drives it around and you see the limits of
50:11
that. So if we assume that there's a general limit, you can see like examples where you have when you're fully under
50:19
complete acceleration, that's where you're at the top. So when you're in complete acceleration, you don't have that much leeway in turning left and
50:25
right because if you're giving too much acceleration power and then you turn, you get outside of the circle and you start to skid. Um, and if you're like
50:32
turning at the maximum rate for the current speed you are, you can't really add any acceleration or braking, otherwise the car slips. Like all of
50:39
those, if some of you are interested in sim racing, you will understand this because this is what you start to learn
50:45
that you have a certain amount of grip available to you as a driver that you're trying to maintain.
50:51
um to maintain within it. Um okay, so
50:57
people like uh plot those G-forces as the driver drives around the race. Like this is what it would look like of all
51:04
the G-forces like the the the driver would turn left, right, accelerate, decelerate, and then you plot point like
51:10
at some point he would go outside of the circle. That's where he loses control of the tire and the the racer race driver tries to maintain it to maintain the
51:17
limit. Um, a more visual example is this one. Um, this is what it looks like when
51:22
a racing driver takes a corner. This is the circle down there. And we're color coding how the steps happen. Do first
51:28
you do maximum braking until you reach the beginning of the corner. So like we see here, you get maximum, you get
51:35
increasing braking till you reach the maximum and then you start turning. As you start turning, you're reducing the brakes because you don't have that much
51:41
budget. So you have to reduce the brakes. And that's what they call trail braking. So, as you increase your turning, you take your foot off the
51:47
brakes until you reach a point your foot is no longer off on on the brake at all. That's where your maximum cornering and
51:54
then as you get out of the corn of the apex of the curve, you start to increasingly add more gas. That's where
52:00
you get acceleration. That's why you calling like unwinding steering. And then you have maximum acceleration when
52:06
you're back on the straight line. This is what um a racing driver feels like.
52:12
And this is the stuff that you want to implement in your game if the person who's playing your game cares about u
52:18
somewhat realistic racing experience. So how do I implement this relationship?
52:24
Unfortunately, this is the experimental part of every racing um every tire
52:29
model. Um it's a lot of it is proprietary like I said and many people approach this differently. It's not that
52:35
it's impossible, but a lot of it can be helped if you have um an actual testing
52:41
facility where you can test those things and you figure out through the graphs that you get out of it what kind of relationship, what kind of analytical
52:47
relationship I can get out of it. Um there are certain models that are also available online like the PCA sharp uh
52:54
model, the dated filia and dogoff. You can look that up if you're interested. Um those can give you clues on how to
52:59
implement this but a bit beyond the scope of this. Um how I approach this I
53:06
do it twofold. Um after I calculate the individual longitudinal and lateral forces I scale them down so that they
53:13
would fit an imaginary uh normalized circle. I also change the knobs
53:20
themselves like they so like the the constants of the PCA formulas are also changing as the slip angle slip ratio
53:27
changes. So out of that um you get an interesting relationship that's actually
53:33
feels nice to drive. So to put it together the tires algorithm in code uh
53:39
in each simulation loop you run the algorithm separately on each tire and the result of that algorithm is two key
53:45
changes. You adjust the angular velocity of the wheel. I showed this at the beginning through that uh differential
53:51
equation and you calculate the forces in the end that come out of um three main
53:56
points. The vertical force that is applied on the chassis which is through the suspension, the traction and brake
54:02
forces, the longitudinal aspect and the lateral forces through steering and slip forces. Putting it together mathematically would look something like
54:07
this. Uh if you're one thing I haven't addressed while talking about this is how do you do collision detection with
54:13
the road for the tires. Now you can do it two ways. One way is through proper
54:18
mesh collision. The tire mesh you collide it with the road or you can do it as many like many car games actually
54:24
do it is through uh um rake casting. So you cast a point from uh you pass a ray
54:31
from the connection point of the tire down to the the direction of the normal of the track uh plus the suspension
54:38
length the current suspension length which is just a spring. And then you get whether it's contact or not in contact.
54:43
that's has born fantastic results actually not doesn't need to be more complicated. And the last aspect of all
54:50
of this is the chassis. This is not a huge section. It's actually just one slide. It's just your regular rigid body
54:57
physics engine because you're just simulating a box in the end that collides with the road.
55:03
So that's the vehicle physics engine in short. Um the three major steps. Um, I
55:12
put it also in like in somewhat kind of a graph that that that tries to visualize the direction of things. The
55:19
one thing key thing to keep like in mind is the blue line that runs horizontally. So like you're taking the previous
55:24
frames because you're solving two differential equations at the same time. So you have to take the result of one of
55:29
them in the so in the resolution of the next for the next frame. So here in this case I'm calculating the engine's RPM
55:35
first multiply by the gear ratio and get calculating the wheels angular velocity and then I take the angular velocity for
55:42
the next frame and so on. Um and I apply then the forces that I mentioned the three main points through four tires on
55:47
four uh points on the engine and you got something that looks like this. This is
55:53
currently like the current version of my uh engine. You can see on the right that the even the curves are changing as the
56:00
car moves around because um well let me go back start it. You can see them as as
56:05
the car turns the curves peaks are also moving. This is what's uh when when I
56:11
said that I was changing the curves as the angles are also changing and the resulting uh uh experience actually
56:18
feels somewhat like a car. Like I I it's not finished. Um I still have to tweak a
56:24
lot of things actually. This whole talk has been one huge rubber ducking uh experience for me. Like I've I have many
56:31
ideas of how to improve this through researching this. And I was stumped stuck on this for for months actually.
56:37
So I'm excited to get back to work on this. Um for any of you who's here in this venue, uh just let me know if you
56:44
want to try it. I have it on my laptop currently. Uh can play around with it and um
56:50
otherwise you can follow me on Twitter on X. I'll be having my uh slides uh my
56:55
sorry my updates for my games there and make sure you check out my AVA at least on Steam. You'll be interested in trying
57:01
that out. Um that's it. Thank you all for listening.
57:09
Thank you. Thank you very much.
Q&A
57:16
And for the Q&A, I am absolutely thrilled and utterly honored that uh
57:23
I'll be sitting on the same couch as uh Mr. Dennis Gustafson, the um
57:29
the architect and artist behind Tear Down. So,
57:35
a round of applause for Dennis, please.
57:42
Thank you for the presentation. Wasim welcome. Thank you. Um, a little bit envious I must say
57:49
really. I remember developing the vehicle physics for ter was one of the most fun
57:54
part you're in the middle of it and you're when I can tell you you're going really deep into it and I it it just
58:02
based on the look on your energy it seems like you're really enjoying it.
58:08
I am. I am. Yeah. Um, really cool. By the way, you showed this video of the drag racing.
58:16
I remember looking also at that a really really descriptive way of of
58:22
understanding how how the wheels deform when you accelerate. And if I remember correctly, I'm not sure it's the same
58:28
video or it's a different one. You can see that when when as the wheel of the
58:33
dragster is spinning faster and faster, just by the weight of the rubber of the
58:38
wheel and the increasing rotation, it actually expands. It's true. Yes.
58:44
Have you seen that? What's really cool and if I understand correctly, dragsters have only a fixed gear and
58:50
it's using this expansion of the rubber. So the wheel actually gets bigger as it goes faster and faster
58:57
as a way uh to have a a bigger ratio so to speak between the engine and the
59:04
road. I thought that was really cool. I just had to mention that I did I didn't know that myself. Okay.
59:09
All right. So let's I have some questions. And the first one I just looked at your screenshots. You have a lot of and I
59:16
also got the opportunity to to try it out. So thank you for that. Uh you have a lot of parameters. Yeah,
59:22
lots and lots of parameters. How do you manage all these parameters without going insane?
59:30
Well, I think it's um it's important to categorize those parameters because some of them are related to actual um things
59:38
that are closer to the physics like the PCA formula or the formula of that abomination that I saw I showed. Um
59:44
these are like direct control parameters that I try to make them as little as possible. But then there's another layer
59:51
of parameters that are actually just they they connect to those that those deeper parameters affect those higher
59:58
level of parameters. Um so like um as soon as I have those this layering the
1:00:04
game is actually not that complicated because the higher level ones I can just replace or change or adjust without really affecting the physics engine that
1:00:11
much because the actual things that's affecting the physics is is simple in the end. At least I try to make it simple.
1:00:17
All right. Do you also have a way If you're playing around tweaking a bunch of parameters like this setting was a
1:00:23
bit better than the previous one, do you have a way to automatically apply those parameters back to the code or are they
1:00:28
saved in a file or how do you they I I usually whenever I have something like this I have them um
1:00:34
periodically updated in a static file on on drive. So anything that I change gets
1:00:40
automatically saved and when I re re relaunch the game. So those things are live life changed as you can see in that
1:00:47
thing. like I change those things and they're they get read and loaded on on as on the launch of the game and they
1:00:53
get stored during the game. Cool. Thank you. Um also had a question
1:00:58
about the update rate. I I understand it correctly. You do the rigid body um
1:01:05
separate from the drivetrain and the tire model and then you you kind of feed them back and forth the forces. Does
1:01:12
that require you to have a higher update rate than you would normally have? Actually, I actually put them all in the
1:01:18
same loop. Like, they're all within the same loop. I'm looping over the vehicles in that time. So, they're all running at
1:01:23
the same rate. I haven't tried splitting the thing. Yes. Sorry. Maybe I um expressed it a
1:01:30
little um badly, but if you tick the game, say at 60 frames per second, do you have is the whole that whole uh tick
1:01:37
including both the tire, the engine, and the vehicle, is that more than 60? That's more that's more than 60. Yes. I
1:01:43
I think I need I need to look that up how many it was, but I think it's it's uh at least double if not more than
1:01:50
that. It's many times more than that. And I split the uh the the physics step below
1:01:55
that. I'm not sure if I'm doing it correctly, but I've tried to separate the uh frame
1:02:01
rate from the physics rate. So, I keep calculating how much frame time is happening to fix the physics step.
1:02:07
Um but it's it's it's currently it's not very performant. I haven't optimized any of that stuff. Yeah. Right.
1:02:14
Um I also was wondering about the the audio. It's pretty cool that you
1:02:19
generate the audio procedurally. I love that. And it's fun. Yeah. Um how close do you think you'll be able
1:02:26
to get to if you if you're aiming for realism do you think how much work would that be?
1:02:32
Exponentially increasing work I think because you can get something that sounds somewhat like it really easily
1:02:37
and every next iteration is going to get increasingly higher. I was actually interested in talking to Sander about
1:02:43
his ideas of how to synthesize like certain sounds because I don't know
1:02:50
anything about audio synthesis. So all of this is just looking stuff up and trying So I don't think I will get
1:02:55
as close as reality honestly. I think it's really difficult to get close to reality. But you can get something that's good enough
1:03:02
and and that's I think that's depends on the goal of my game. I guess my game is not going to be a realistic simulator in
1:03:07
the end. Maybe a sim cade kind of thing. Yeah. Yeah. Yeah. That that was actually my ne next question whe whether you're aiming for
1:03:12
total realism or is this this more on the like a fun experience.
1:03:18
I'd like to aim to as close to realistic as possible as far as I can because uh I
1:03:23
think it gets to a point where also it's way too complicated for me without any external help. Um but I want to get this
1:03:29
into all of this is experimental is actually also my very first 3D project. So I'm learning about 3D rendering,
1:03:37
about physics, about many things at the same time. So I want to get into a position where I learn the technology
1:03:44
um learn enough the technology so that the next iteration I will decide okay this is the limitation I want to add for
1:03:50
the game or maybe make something fun out of this to as far as I I I could get it. Yeah.
1:03:56
Cool. Shall we maybe open up and see if someone from the audience has a
1:04:02
question? One right here. I want to ask a little bit about the RPM to power ratio for the engine simulation
1:04:09
and some of the the like uh like transmission gear ratio kind of stuff. You mentioned at the beginning the like
1:04:14
feeling from movies of like shifting up like seven eight times or um there is actually a feeling I get when I try and
1:04:20
do like a 0 to 60 test or whatever, right? like where you're like you're trying to get this certain spot where you're out of like power on one gear and
1:04:26
you need to shift to the next. Is there like something on those graphs of like this is the spot you're aiming for? Is
1:04:31
there like some inflection point? There is um in the graphs
1:04:37
wait I can I do am I allowed to do this? It was right before this part. Yes, you
1:04:43
can see on the right graph that um there's an area where the there's a
1:04:49
point where the first gear drops and hits the peak of the second gear. That's more or less where you would time your
1:04:56
your peak shift because like there's a there's a maximum amount of power for each one of them and they start to
1:05:01
overlap and you can look up the torque curves of your engine and you can visualize them as well and then you can
1:05:07
I think there you might be able to come up with an analytical formula to calculate the recommended shift up and
1:05:12
shift down. I think so. Yeah.
1:05:19
Any other question? This is a question for both of you, but how could I saw no
1:05:25
mention of turbo lag, which in my opinion is the most
1:05:33
Have you implemented turbo lag? Well, it is in the audio file, but but
1:05:41
I I I think realistically you can you can do that because um you can add that
1:05:47
to the part of the engine code where there is something that's um like an increasing floating float that that
1:05:54
increases the more you're holding the uh the gas until it spins to a high enough
1:05:59
ratio and then you add um a number that's to the scaler. be yet another
1:06:05
like in yet another one of those things in the in the differential equation but it's basically just just like one small variable that you can to
1:06:14
mash I have a question related to chess physics that simple body
1:06:21
yes so there are some racing games like going for really realistic approach
1:06:26
but they also have a rough terrain and when you jump from cliff sometimes they want you to land on your heels
1:06:33
without you losing the realistic feeling of that like and how would you approach that? Do
1:06:39
you implement cat physics for a car? So really I think probably you just do you just do
1:06:45
if no contact with the ground then you you take the wheel of the physics and then you try to for to force the to take
1:06:51
take control of the forces to steer it in a certain direction. The tricky part is that it should still feel
1:06:57
realistically like modern car to do an arcade like right that's true
1:07:02
so maybe a cat physics car I don't know how would you approach that problem how would you solve it
1:07:11
trying I guess I don't know yeah you you you basically yeah you cut you cut physics you I mean you you at
1:07:17
some point you just make an if condition if there is no contact the wheel in the ground and then you calculate the
1:07:22
trajectory same had like a cat. Yeah. My conversation is really
1:07:28
bad. Oh, no. Like the animal. Yeah. Animal who like always arrives on his legs. Yeah. Basically. Yeah. You you you as
1:07:35
soon as you detect that you're off the road, you start to figure out in what direction you're going, whether you will
1:07:40
be landing on your feet when you're getting there, and then add, I guess, increasing torque on the body of the car
1:07:46
to fix that. Maybe. Yeah. Could probably done in many ways. Turon actually has a little bit of this
1:07:52
and there is a parameter that you can you can tweak when you set up the vehicle which artificially makes the um
1:08:00
the distance between the wheels wider not vis visually but you actually apply
1:08:07
the forcer further out on the car and that automatically stabilizes in all directions.
1:08:12
Interesting. So that's a that's a small that's the that's the answer.
1:08:19
Uh yes. Does the weight distribution of the car matter at all? Like the engine's in the
1:08:24
front and that's very heavy. It does. It does actually. Yes, it does. Um I don't do it correctly
1:08:30
there. I have an inertia tensor on the just on the geometry calculated from the geometry of the car. But the car has
1:08:37
like all wrong weight values. It matters a lot where the engine is because that changes how much weight load is on the
1:08:44
individual tires and that affects the entire curves. Actually this is where
1:08:49
yeah but it's like implicit in your curves that you use or in no in the end you multiply after you
1:08:56
do those curves um all of this is the amplitude of that curve is multiplied
1:09:01
like by the weight load by some factor based on the current suspension load like the vertical force. So like you calculate the vertical force and then
1:09:07
you multiply that by any resulting force you get in the end. So it scales it either up or down.
1:09:12
If you allow me like real quickly. So where do you find these curves and like where do you find your research? One book I recommend it's called the
1:09:20
Milikin. It's written by Milikin u M I L L I K A N. I think it was called Racing
1:09:27
Car Dynamics. It's like an 800page book. And the interesting I did not read all of it but the interesting part is also
1:09:34
its references. So like he would also tell you like this is my reference for this current chapter and from those
1:09:39
there are also other interesting books you can find on this and there mostly there are books from the last century
1:09:44
like the more the more the older you get the more interesting it gets because like there was ones that from the 60s
1:09:50
from like post-war uh tests on like on on like uh motorcycle tires and stuff
1:09:56
like that but the concepts are the same but those books were really inspirational they have a lot of u a lot
1:10:01
of diagrams and a lot of pictures that help or something. I'll I'll put it in the group. I'll I'll
1:10:07
put some. So, how many of these books did you read as part of the research? I did not I don't I did not read
1:10:12
complete books, but uh I think there are two large books that I were my main reference that I read a lot of chapters
1:10:18
from like was the Milicanin one and the one about the tire dynamics. I would have to look up to remember its name.
1:10:24
Those are the main ones. And did we have one here? As someone who's never in the engine, to
1:10:31
what extent is the order you're applying forces or possibly modulating different
1:10:37
constants. To what to what extent is that is there a correct way of doing it and to what extent is that an artistic
1:10:43
choice? Um well, you need to integrate the last
1:10:50
like the the way the way at least my engine works and I'm it's the first physics engine I read so I don't know if
1:10:55
it's good. I'm copying people's work mostly for this one. the general rigid body engine is that u um I integrate I
1:11:04
think I have it as the uh as the function I think it's here but it's not
1:11:09
okay so um I calculate the forces of of of the engine first which of which which
1:11:16
affects the wheels which affect the chassis and then I have like a collection of forces that apply on the chassis. What you want to do is you want
1:11:22
to accumulate all the forces on the rigid body and in the end you integrate those forces. So you change them and the
1:11:29
way I do it which I'm pretty sure is not the perfect way. I think Dennis will will correct me. Um you calculate the
1:11:35
collisions then with other objects and then I resolve those collisions and that's like the general algorithm of how
1:11:41
it works for each physics steps. But you had the birectional forces between the engine and the
1:11:47
yes those happen. Um okay so let yeah okay I address that. So like um I start
1:11:52
by the engine first. So I calculate the RPM value which is which takes the
1:11:58
angular velocity of the wheel from the previous frame. So like the current one that's available in memory actually and
1:12:04
um I use that to to calculate the RPM and then downstream as I get to the tire
1:12:09
forces I calculate the wheels angular velocity from the current RPM that I
1:12:15
just calculated. Does that help? Is the choice to do it that way around
1:12:23
the wheels first and then engine just like the engine is the I haven't really looked really deep into how much it affects each other.
1:12:28
Honestly, I this is like the version that worked honestly. But maybe Dennis has
1:12:34
something. I think you can normally see it if you if you see these like doing engine wheels, engine wheels and and
1:12:41
doing it if you just line them up and not think so much about where the frame cut is, it's it's ends up being almost
1:12:47
the same thing. So, usually it doesn't matter so much. Yeah.
1:12:53
Bring this up necessarily, but I really like the the slide you have about like the the cornering like line,
1:12:58
right? Yes. Uh I haven't seen the like friction circle before and that visualization of like maximum braking to maximum steering to like whatever,
1:13:04
right? Um that's something that like again you kind of like kind of get a feel for that as a human if you try and do like racing line like stuff. But one
1:13:10
of the things I found interesting the the orange part the like maximum cornering as you're like totally steering, no acceleration, no braking
1:13:16
looked like the most obtuse part like the least actual sharp angle. Is that is
1:13:21
that just the way it was drawn? Oh, it's just it's I I drew a racing line. I did not really engineer the
1:13:27
perfect racing line out of it, but it's just basically to general idea, but but yeah, that's actually a whole science of
1:13:33
how racing drivers approach this. And it depends on how you set up the car and stuff like that.
1:13:38
So presumably that spot is actually like maximum like sideways. That's you you would imagine that's the place where you're getting the maximum
1:13:45
sideways force where you're turning the car like
1:13:51
this. Yeah. The curve will also look different because your acceleration your braking is not the same,
1:13:56
right? So the the maximum turning will not happen at the apex, right? Unless your car has like exactly the
1:14:03
same acceleration forces as as breaking force. So therefore it looks Yeah,
1:14:08
it's different. Thank you. Thank you.
1:14:14
Yeah. So um have you thought about using more contact points per lead to sort of
1:14:22
approximate, you know, a shape better. I I have, but I I will do that as soon as I get this nailed down properly
1:14:28
because like there's a lot of things I need to still fix in my code currently because um this is the conclusion I got
1:14:34
through while I was realizing where my mistakes are and I'm where but all of this is like still work in progress. So,
1:14:39
as soon as I really nail down a model that is stable, that doesn't explode, that doesn't um that man manage the edge
1:14:47
cases properly, uh I would probably going to test how the tire deformation actually works. That would be very
1:14:53
interesting. All right. If we have no more Oh, there.
1:15:02
Did you do any aerodynamics? like not realize of course but like
1:15:08
I just I just simulated aerodynamic drag which is just um a constant time like
1:15:14
it's a minus constant times uh the square of the of the length that's it
1:15:20
slows it down but nothing more like the actual aerodynamic downforce but I would like to do that
1:15:25
actually I think we have one more Rafael right yeah it's just a comment your talk I've
1:15:32
never seen this entire information videos I did before and it made me feel some empathy for my tires. Like
1:15:41
I'm like, "Oh man, what I'm doing? What am I doing to it's another thing?"
1:15:46
Take care of your tires. Yeah. Uh I have one last question here.
1:15:53
Yes or no? You can just answer yes or no. Are you going to do anything with suspension? Like when you accelerate or decelerate like a car does like
1:15:58
something like this? It does that already. It's emergent. Like that's all you need to do is you need to apply the forces in the right
1:16:05
position and it's already there. It it already does that if you look at the videos. Um it already does that. Yeah.
1:16:14
H yes. Does your current system take into account the camber of the wheels? Not currently. And that's a very good
1:16:20
question because camber really affects this thing hugely. I didn't mention it at all because like it's just it's
1:16:25
another dimension of this thing but it's in the end it's an angle of attack for those things and it also has its own
1:16:30
graphs. So camber I think if not everyone knows is the oh yeah what what you like a vertical
1:16:38
angle like if we're looking at the car from the front it's where it's whether the wheels are like this or like this right
1:16:43
to out. No toe out is is is for you're looking at it from the above above and you do
1:16:49
this there is this in as well right that's the oh yeah the the uh the
1:16:56
acrement and anti-accment angle and stuff like that. Is that anyone else?
1:17:04
All right. What should the slip ratio be called?
1:17:10
Actually, I like angle and ratio are good terms, but I prefer if they were called like longitudinal or lateral.
1:17:18
Like if there was a word about longitudinal and lateral in it. long slong like longitudinal ratio and
1:17:25
lateral angle or longitudinal uh coefficient lateral coefficient something like that. It would be much
1:17:31
more descriptive in the name so you don't have tongue twisters. Yeah.
1:17:37
All right. I only have one final question before we cut and that is do you have one of those racing rigs at
1:17:45
home? I have whatever I could afford. Like I could afford a GeForce. I think it was
1:17:50
926 or something. And I have a VR and I got into iRacing and stuff like that. I do. I have him at home. Yeah.
1:17:56
Cool. All right. Round of applause. Thank you.
1:18:03
Thank you very much. Honored. Thank you.
